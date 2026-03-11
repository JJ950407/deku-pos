require('dotenv').config({ path: __dirname + '/.env' });
console.log("SHADOW_WRITE_ENABLED =", process.env.SHADOW_WRITE_ENABLED);
const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const { shadowWriteOrder } = require("./db_shadow");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const MENU_PATH = path.join(DATA_DIR, "menu.json");
const ORDERS_PATH = path.join(DATA_DIR, "orders.json");
const PROMO_PATH = path.join(DATA_DIR, "promo.json");
const PROMO_TZ = "America/Mexico_City";
const readyTimers = new Map();
const PUBLIC_DIR = path.join(__dirname, "../public");
const SESSION_COOKIE = "mesero_session";
const SESSION_VALUE = "ok";

app.use(express.json({ limit: "1mb" }));

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return acc;
    }
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] === SESSION_VALUE;
}

app.use("/api", (req, res, next) => {
  if (req.path === "/login") {
    return next();
  }
  if (req.path === "/menu" && req.method === "GET") {
    return next();
  }
  if (req.path === "/orders" && req.method === "GET") {
    return next();
  }
  if (/^\/orders\/[^/]+$/.test(req.path) && req.method === "PATCH") {
    return next();
  }
  if (isAuthenticated(req)) {
    return next();
  }
  return res.status(401).json({ error: "No autorizado." });
});

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
}

function loadMenu() {
  return safeReadJson(MENU_PATH, { products: [] });
}

function loadOrders() {
  return safeReadJson(ORDERS_PATH, []);
}

function loadPromoState() {
  const fallback = { manualOverrideEnabled: false, updatedAt: null };
  const data = safeReadJson(PROMO_PATH, null);
  if (!data || typeof data.manualOverrideEnabled !== "boolean") {
    safeWriteJson(PROMO_PATH, fallback);
    return fallback;
  }
  return {
    manualOverrideEnabled: data.manualOverrideEnabled,
    updatedAt: data.updatedAt || null
  };
}

function savePromoState(state) {
  safeWriteJson(PROMO_PATH, state);
}

function saveOrders(orders) {
  safeWriteJson(ORDERS_PATH, orders);
}

function normalizeTable(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value === "Para llevar" || value === "PL") {
    return "PL";
  }
  const number = Number(value);
  if (Number.isInteger(number) && number >= 1 && number <= 10) {
    return String(number);
  }
  return null;
}

function clearReadyTimer(orderId) {
  const existing = readyTimers.get(orderId);
  if (existing) {
    clearTimeout(existing);
    readyTimers.delete(orderId);
  }
}

function scheduleDelivered(orderId) {
  clearReadyTimer(orderId);
  const timer = setTimeout(() => {
    const orders = loadOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status !== "ready") {
      return;
    }
    order.status = "delivered";
    saveOrders(orders);
    broadcast("order:updated", order);
  }, 180000);
  readyTimers.set(orderId, timer);
}

function syncReadyTimer(order) {
  if (order.status === "ready") {
    scheduleDelivered(order.id);
    return;
  }
  clearReadyTimer(order.id);
}

function canTransition(from, to) {
  if (to === "cancelled") {
    return from !== "paid";
  }
  if (from === "pending") {
    return to === "preparing";
  }
  if (from === "preparing") {
    return to === "ready";
  }
  if (from === "ready") {
    return to === "delivered";
  }
  if (from === "delivered") {
    return to === "paid";
  }
  if (from === "paid") {
    return false;
  }
  return false;
}

async function updateOrderStatus(id, status, meta = {}) {
  const orders = loadOrders();
  const order = orders.find((item) => item.id === id);
  if (!order) {
    return { error: "Orden no encontrada." };
  }
  if (order.status === status) {
    return { order };
  }
  if (!canTransition(order.status, status)) {
    return { error: "Transición inválida." };
  }
  order.status = status;
  if (status === "paid") {
    order.paidAt = new Date().toISOString();
  }
  if (status === "cancelled") {
    order.cancelledAt = new Date().toISOString();
    if (meta.cancelReason) {
      order.cancelReason = meta.cancelReason;
    }
  }
  saveOrders(orders);
  if (status === "paid") {
    try {
      var itemsRows = buildItemsRowsFromOrder(order);
      await shadowWriteOrder(order, itemsRows);
    } catch (err) {
      console.error("Shadow write failed:", err.message);
    }
  }
  broadcast("order:updated", order);
  syncReadyTimer(order);
  return { order };
}

function broadcast(event, data) {
  const message = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// =========================
// CSV Export (JSON -> CSV)
// =========================
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  var s = String(val);
  // Escape quotes by doubling
  if (s.indexOf('"') !== -1) s = s.replace(/"/g, '""');
  // Wrap if it contains comma, quote, or newline
  if (/[",\n\r]/.test(s)) s = '"' + s + '"';
  return s;
}

function pickOrderDateForRange(order) {
  // Prefer paidAt for sales-based ranges; fallback to createdAt
  var d = (order && order.paidAt) ? order.paidAt : (order && order.createdAt);
  return d ? new Date(d) : null;
}

function startOfTodayLocal() {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function getRangeBounds(range) {
  var now = new Date();
  if (range === 'today') {
    return { from: startOfTodayLocal(), to: now };
  }
  // default: week (últimos 7 días)
  var from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: from, to: now };
}

function ordersToCsvRows(orders) {
  var lines = [];
  // Header
  lines.push([
    'id',
    'createdAt',
    'paidAt',
    'status',
    'table',
    'total',
    'promoDiscount'
  ].join(','));

  for (var i = 0; i < orders.length; i++) {
    var o = orders[i] || {};
    var totals = o.totals || {};
    var row = [
      csvEscape(o.id || ''),
      csvEscape(o.createdAt || ''),
      csvEscape(o.paidAt || ''),
      csvEscape(o.status || ''),
      csvEscape(o.table || ''),
      csvEscape(typeof totals.total === 'number' ? totals.total : (totals.total || '')),
      csvEscape(typeof o.promoDiscount === 'number' ? o.promoDiscount : (o.promoDiscount || 0))
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n') + '\n';
}

function toNumber(val) {
  if (typeof val === 'number') return val;
  var n = Number(val);
  return isNaN(n) ? 0 : n;
}

function buildItemsRowsFromOrder(order) {
  var rows = [];
  var o = order || {};
  var items = Array.isArray(o.items) ? o.items : [];

  for (var j = 0; j < items.length; j++) {
    var it = items[j] || {};
    var meta = it.meta || {};
    var qty = toNumber(it.qty || 0);
    var unit = toNumber(it.unitPrice || 0);
    var lineTotal = qty * unit;

    rows.push({
      orderId: o.id || '',
      createdAt: o.createdAt || '',
      paidAt: o.paidAt || '',
      status: o.status || '',
      table: o.table || '',
      orderSubtotal: (o.totals && typeof o.totals.subtotal === 'number') ? o.totals.subtotal : (o.totals && o.totals.subtotal) || '',
      orderTotal: (o.totals && typeof o.totals.total === 'number') ? o.totals.total : (o.totals && o.totals.total) || '',
      promoDiscount: typeof o.promoDiscount === 'number' ? o.promoDiscount : (o.promoDiscount || 0),
      promoType: o.promoType || '',
      lineType: 'item',
      productId: it.productId || '',
      name: it.name || '',
      qty: qty,
      unitPrice: unit,
      lineTotal: lineTotal,
      size: meta && meta.size ? meta.size : '',
      spicy: meta && (meta.spicy !== undefined && meta.spicy !== null) ? meta.spicy : '',
      parentProductId: ''
    });

    var extras = meta && Array.isArray(meta.extras) ? meta.extras : [];
    for (var k = 0; k < extras.length; k++) {
      var ex = extras[k] || {};
      var exQty = toNumber(ex.qty || 0);
      var exUnit = toNumber(ex.unitPrice || 0);
      var exTotal = exQty * exUnit;
      rows.push({
        orderId: o.id || '',
        createdAt: o.createdAt || '',
        paidAt: o.paidAt || '',
        status: o.status || '',
        table: o.table || '',
        orderSubtotal: (o.totals && typeof o.totals.subtotal === 'number') ? o.totals.subtotal : (o.totals && o.totals.subtotal) || '',
        orderTotal: (o.totals && typeof o.totals.total === 'number') ? o.totals.total : (o.totals && o.totals.total) || '',
        promoDiscount: typeof o.promoDiscount === 'number' ? o.promoDiscount : (o.promoDiscount || 0),
        promoType: o.promoType || '',
        lineType: 'extra',
        productId: ex.productId || '',
        name: ex.name || '',
        qty: exQty,
        unitPrice: exUnit,
        lineTotal: exTotal,
        size: meta && meta.size ? meta.size : '',
        spicy: meta && (meta.spicy !== undefined && meta.spicy !== null) ? meta.spicy : '',
        parentProductId: it.productId || ''
      });
    }
  }

  return rows;
}

function ordersToItemsCsvRows(orders) {
  var lines = [];
  lines.push([
    'orderId','createdAt','paidAt','status','table',
    'orderSubtotal','orderTotal','promoDiscount','promoType',
    'lineType','productId','name','qty','unitPrice','lineTotal',
    'size','spicy','parentProductId'
  ].join(','));

  for (var i = 0; i < orders.length; i++) {
    var o = orders[i] || {};
    var rows = buildItemsRowsFromOrder(o);

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      lines.push([
        csvEscape(o.id || ''),
        csvEscape(o.createdAt || ''),
        csvEscape(o.paidAt || ''),
        csvEscape(o.status || ''),
        csvEscape(o.table || ''),
        csvEscape(typeof o.totals?.subtotal === 'number' ? o.totals.subtotal : (o.totals?.subtotal || '')),
        csvEscape(typeof o.totals?.total === 'number' ? o.totals.total : (o.totals?.total || '')),
        csvEscape(typeof o.promoDiscount === 'number' ? o.promoDiscount : (o.promoDiscount || 0)),
        csvEscape(o.promoType || ''),
        csvEscape(row.lineType),
        csvEscape(row.productId),
        csvEscape(row.name),
        csvEscape(row.qty),
        csvEscape(row.unitPrice),
        csvEscape(row.lineTotal),
        csvEscape(row.size),
        csvEscape(row.spicy),
        csvEscape(row.parentProductId)
      ].join(','));
    }
  }

  return lines.join('\n') + '\n';
}

function generateOrderId() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${Date.now()}-${random}`;
}

function validateOrderPayload(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    return "La orden debe incluir items.";
  }
  if (!payload.totals || typeof payload.totals.total !== "number") {
    return "La orden debe incluir totales válidos.";
  }
  const table = normalizeTable(payload.table);
  if (!table) {
    return "La orden debe incluir mesa válida.";
  }
  return null;
}

function isThursdayNow(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: PROMO_TZ, weekday: "short" }).format(now);
  return weekday === "Thu";
}

function buildPromoPayload(promoState, now = new Date()) {
  const isThursday = isThursdayNow(now);
  const manualOverrideEnabled = Boolean(promoState.manualOverrideEnabled);
  const promoActive = isThursday || manualOverrideEnabled;
  const promoSource = promoActive ? (isThursday ? "auto_thursday" : "manual_override") : null;
  return {
    isThursdayNow: isThursday,
    manualOverrideEnabled,
    promoActive,
    promoSource,
    tz: PROMO_TZ,
    nowISO: now.toISOString(),
    promoType: "2x1_jueves"
  };
}

function calculatePromoDiscount(items) {
  const menu = loadMenu();
  const menuById = new Map(menu.products.map((product) => [product.id, product]));
  const ramenBasePrices = [];
  items.forEach((item) => {
    const product = menuById.get(item.productId);
    if (!product || product.category !== "ramen") {
      return;
    }
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice)) {
      return;
    }
    const extrasTotal = Array.isArray(item.meta && item.meta.extras)
      ? item.meta.extras.reduce((sum, extra) => {
        const extraUnit = Number(extra.unitPrice);
        const extraQty = Number(extra.qty);
        if (!Number.isFinite(extraUnit) || !Number.isFinite(extraQty)) {
          return sum;
        }
        return sum + extraUnit * extraQty;
      }, 0)
      : 0;
    const basePrice = unitPrice - extrasTotal;
    const safeBasePrice = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0;
    for (let i = 0; i < qty; i += 1) {
      ramenBasePrices.push(safeBasePrice);
    }
  });
  ramenBasePrices.sort((a, b) => a - b);
  let discount = 0;
  for (let i = 0; i + 1 < ramenBasePrices.length; i += 2) {
    discount += ramenBasePrices[i];
  }
  return discount;
}

app.get("/api/menu", (req, res) => {
  const menu = loadMenu();
  res.json(menu);
});

app.get("/api/promo", (req, res) => {
  const promoState = loadPromoState();
  const payload = buildPromoPayload(promoState);
  res.json(payload);
});

app.post("/api/promo/override", (req, res) => {
  const { enabled } = req.body || {};
  const promoState = {
    manualOverrideEnabled: Boolean(enabled),
    updatedAt: new Date().toISOString()
  };
  savePromoState(promoState);
  const payload = buildPromoPayload(promoState);
  res.json(payload);
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUser = typeof username === "string" ? username.trim().toLowerCase() : "";
  const normalizedPass = typeof password === "string" ? password.trim() : "";
  if (normalizedUser === "aurora" && normalizedPass === "pucca123") {
    res.cookie(SESSION_COOKIE, SESSION_VALUE, { httpOnly: true, sameSite: "lax" });
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Credenciales inválidas." });
});

app.get("/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.redirect("/login");
});

app.get("/api/orders", (req, res) => {
  const { status } = req.query;
  let orders = loadOrders();
  if (status) {
    orders = orders.filter((order) => order.status === status);
  }
  orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(orders);
});

app.post("/api/orders", (req, res) => {
  const error = validateOrderPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const table = normalizeTable(req.body.table);
  if (!table) {
    return res.status(400).json({ error: "Mesa inválida." });
  }

  const now = new Date();
  const promoState = loadPromoState();
  const promoPayload = buildPromoPayload(promoState, now);
  const promoDiscount = calculatePromoDiscount(req.body.items);
  const promoApplied = promoPayload.promoActive && promoDiscount > 0;
  const totals = req.body.totals;
  const noteValue = typeof req.body.note === "string"
    ? req.body.note.trim()
    : typeof req.body.notes === "string"
      ? req.body.notes.trim()
      : "";
  const note = noteValue || null;

  const orders = loadOrders();
  const order = {
    id: generateOrderId(),
    createdAt: now.toISOString(),
    status: "pending",
    table,
    items: req.body.items,
    totals,
    note,
    notes: noteValue
  };
  order.promoApplied = promoApplied;
  order.promoType = "2x1_jueves";
  order.promoSource = promoPayload.promoActive ? promoPayload.promoSource : null;
  order.promoDiscount = promoDiscount;
  order.promoTimestamp = now.toISOString();
  orders.push(order);
  saveOrders(orders);
  broadcast("order:new", order);
  syncReadyTimer(order);
  res.status(201).json(order);
});

app.patch("/api/orders/:id", (req, res) => {
  const { id } = req.params;
  const { status, cancelReason } = req.body;
  if (!status || !["pending", "preparing", "ready", "delivered", "paid", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Status inválido." });
  }
  const result = updateOrderStatus(id, status, { cancelReason });
  if (result.error) {
    const code = result.error === "Orden no encontrada." ? 404 : 400;
    return res.status(code).json({ error: result.error });
  }
  res.json(result.order);
});

app.post("/api/orders/:id/items", (req, res) => {
  const { id } = req.params;
  const itemsToAppend = req.body && Array.isArray(req.body.items) ? req.body.items : null;
  if (!itemsToAppend || !itemsToAppend.length) {
    return res.status(400).json({ error: "Items inválidos." });
  }

  const orders = loadOrders();
  const order = orders.find((item) => item.id === id);
  if (!order) {
    return res.status(404).json({ error: "Orden no encontrada." });
  }
  if (["paid", "cancelled"].includes(order.status)) {
    return res.status(400).json({ error: "La orden no puede editarse." });
  }

  const normalizedItems = itemsToAppend
    .map((item) => ({
      productId: item && item.productId,
      name: item && item.name,
      qty: Number(item && item.qty),
      basePrice: Number(item && item.basePrice),
      unitPrice: Number(item && item.unitPrice),
      meta: item && item.meta ? item.meta : {}
    }))
    .filter((item) => item.productId && item.name && Number.isFinite(item.qty) && item.qty > 0 && Number.isFinite(item.unitPrice));

  if (!normalizedItems.length) {
    return res.status(400).json({ error: "Items inválidos." });
  }

  order.items = [...(order.items || []), ...normalizedItems];

  const subtotal = order.items.reduce((sum, item) => {
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) {
      return sum;
    }
    return sum + qty * unitPrice;
  }, 0);

  const now = new Date();
  const promoState = loadPromoState();
  const promoPayload = buildPromoPayload(promoState, now);
  const promoDiscount = calculatePromoDiscount(order.items);
  const promoApplied = promoPayload.promoActive && promoDiscount > 0;

  order.totals = {
    subtotal,
    total: promoApplied ? Math.max(0, subtotal - promoDiscount) : subtotal
  };
  order.promoApplied = promoApplied;
  order.promoType = "2x1_jueves";
  order.promoSource = promoPayload.promoActive ? promoPayload.promoSource : null;
  order.promoDiscount = promoDiscount;
  order.promoTimestamp = now.toISOString();

  saveOrders(orders);
  broadcast("order:updated", order);
  syncReadyTimer(order);
  res.json(order);
});

app.post("/api/orders/cleanup-tests", (req, res) => {
  const body = req.body || {};
  if (body.confirmText !== "LIMPIAR") {
    return res.status(400).json({ error: "Confirmación inválida." });
  }
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Fecha inválida." });
  }

  const orders = loadOrders();
  const keep = [];
  let removed = 0;

  orders.forEach((order) => {
    const sourceDate = order && (order.createdAt || order.timestamp || order.updatedAt);
    const parsed = sourceDate ? new Date(sourceDate) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      keep.push(order);
      return;
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const orderDate = `${year}-${month}-${day}`;
    if (orderDate === date) {
      removed += 1;
      clearReadyTimer(order.id);
      return;
    }
    keep.push(order);
  });

  saveOrders(keep);
  res.json({ ok: true, removed, date });
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

app.use(express.static(PUBLIC_DIR));

app.use((req, res, next) => {
  const pathName = req.path;
  if (pathName.startsWith("/kitchen")) {
    return next();
  }
  if (pathName.startsWith("/api")) {
    return next();
  }
  if (pathName === "/login" || pathName === "/logout" || pathName === "/login.css" || pathName === "/login.js") {
    return next();
  }
  if (pathName === "/assets/brand/logo.png" || pathName.startsWith("/assets/menu/")) {
    return next();
  }
  if (isAuthenticated(req)) {
    return next();
  }
  return res.redirect("/login");
});

// Admin export CSV (JSON source of truth)
app.get('/admin/export.csv', function(req, res) {
  try {
    // Allow token auth if configured (useful for public server), otherwise require cookie session
    var tokenEnv = process.env.ADMIN_EXPORT_TOKEN;
    var tokenQ = req.query && req.query.token ? String(req.query.token) : '';
    var hasValidToken = tokenEnv && tokenQ && tokenQ === tokenEnv;

    // Cookie auth: same session cookie used by waiter login
    // If token is valid, skip cookie requirement.
    if (!hasValidToken) {
      var cookieHeader = req.headers && req.headers.cookie ? String(req.headers.cookie) : '';
      if (cookieHeader.indexOf('mesero_session=ok') === -1) {
        res.status(401).send('Unauthorized');
        return;
      }
    }

    var include = (req.query && req.query.include) ? String(req.query.include) : 'paid';
    var range = (req.query && req.query.range) ? String(req.query.range) : 'week';
    var bounds = getRangeBounds(range);

    var orders = loadOrders() || [];

    // Filter by status
    var filtered = [];
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      if (!o) continue;
      if (include !== 'all') {
        if (o.status !== 'paid') continue; // PAGADO real confirmado
      }
      // Excluir canceladas siempre salvo include=all (si quieren auditar)
      if (include !== 'all' && o.status === 'cancelled') continue;

      var d = pickOrderDateForRange(o);
      if (!d || isNaN(d.getTime())) continue;
      if (d < bounds.from || d > bounds.to) continue;
      filtered.push(o);
    }

    // Sort by date asc
    filtered.sort(function(a, b) {
      var da = pickOrderDateForRange(a);
      var db = pickOrderDateForRange(b);
      var ta = da ? da.getTime() : 0;
      var tb = db ? db.getTime() : 0;
      return ta - tb;
    });

    var csv = ordersToCsvRows(filtered);

    var now = new Date();
    var yyyy = String(now.getFullYear());
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    var fname = 'deku_orders_' + yyyy + '-' + mm + '-' + dd + '.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
    res.status(200).send(csv);
  } catch (e) {
    console.error('[export.csv] error:', e);
    res.status(500).send('Export error');
  }
});

// Admin export detailed items CSV (JSON source of truth)
app.get('/admin/export-items.csv', function(req, res) {
  try {
    var tokenEnv = process.env.ADMIN_EXPORT_TOKEN;
    var tokenQ = req.query && req.query.token ? String(req.query.token) : '';
    var hasValidToken = tokenEnv && tokenQ && tokenQ === tokenEnv;

    if (!hasValidToken) {
      var cookieHeader = req.headers && req.headers.cookie ? String(req.headers.cookie) : '';
      if (cookieHeader.indexOf('mesero_session=ok') === -1) {
        res.status(401).send('Unauthorized');
        return;
      }
    }

    var include = (req.query && req.query.include) ? String(req.query.include) : 'paid';
    var range = (req.query && req.query.range) ? String(req.query.range) : 'week';
    var bounds = getRangeBounds(range);

    var orders = loadOrders() || [];
    var filtered = [];
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      if (!o) continue;
      if (include !== 'all') {
        if (o.status !== 'paid') continue;
      }
      if (include !== 'all' && o.status === 'cancelled') continue;

      var d = pickOrderDateForRange(o);
      if (!d || isNaN(d.getTime())) continue;
      if (d < bounds.from || d > bounds.to) continue;
      filtered.push(o);
    }

    filtered.sort(function(a, b) {
      var da = pickOrderDateForRange(a);
      var db = pickOrderDateForRange(b);
      var ta = da ? da.getTime() : 0;
      var tb = db ? db.getTime() : 0;
      return ta - tb;
    });

    var csv = ordersToItemsCsvRows(filtered);

    var now = new Date();
    var yyyy = String(now.getFullYear());
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    var fname = 'deku_order_items_' + yyyy + '-' + mm + '-' + dd + '.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
    res.status(200).send(csv);
  } catch (e) {
    console.error('[export-items.csv] error:', e);
    res.status(500).send('Export error');
  }
});

app.use("/kitchen", express.static(path.join(__dirname, "../kitchen-display")));
app.use("/", express.static(path.join(__dirname, "../waiter-app")));

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ event: "connected", data: "ok" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`POS backend running on http://localhost:${PORT}`);
  loadOrders().forEach((order) => syncReadyTimer(order));
});
