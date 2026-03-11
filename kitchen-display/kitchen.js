const ordersContainer = document.getElementById("orders");
const connectionStatus = document.getElementById("connectionStatus");
const BASE_URL = window.location.origin;

let orders = [];
let menuMap = new Map();
let menuNameMap = new Map();

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function normalizeBase(url) {
  try {
    return new URL(url).origin;
  } catch (e) {
    return null;
  }
}

function computeDefaultBackend() {
  return isLocalhostHost(window.location.hostname)
    ? "http://localhost:3000"
    : window.location.origin;
}

function resolveBackendBase() {
  const stored = localStorage.getItem("backendUrl");
  const computed = computeDefaultBackend();
  if (!stored) {
    localStorage.setItem("backendUrl", computed);
    return computed;
  }
  const normalized = normalizeBase(stored);
  if (!normalized) {
    localStorage.setItem("backendUrl", computed);
    return computed;
  }
  if (!isLocalhostHost(window.location.hostname)) {
    const storedHost = new URL(normalized).hostname;
    if (isLocalhostHost(storedHost)) {
      localStorage.setItem("backendUrl", window.location.origin);
      return window.location.origin;
    }
  }
  return normalized;
}

const BACKEND_BASE = resolveBackendBase();

function apiUrl(path) {
  return new URL(path, BACKEND_BASE).toString();
}

function apiGet(path) {
  return fetch(apiUrl(path));
}

function assetUrl(path) {
  return new URL(path, BACKEND_BASE).toString();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildItemLine(item) {
  if (item.meta && item.meta.size) {
    const extras = item.meta.extras && item.meta.extras.length
      ? ` | Extras: ${item.meta.extras.map((extra) => `${extra.name} x${extra.qty}`).join(", ")}`
      : "";
    const spicy = item.meta.spicy ? `, Picante ${item.meta.spicy}` : "";
    return `${item.qty}x ${item.name} (${item.meta.size}${spicy}${extras})`;
  }
  return `${item.qty}x ${item.name}`;
}

function getProductImage(productId) {
  const product = menuMap.get(productId);
  return product ? assetUrl(`/assets/menu/${product.image}`) : null;
}

function getProductImageByName(name) {
  const product = menuNameMap.get(name.toLowerCase());
  return product ? assetUrl(`/assets/menu/${product.image}`) : null;
}

function renderOrders() {
  ordersContainer.innerHTML = "";
  const visibleOrders = orders.filter((order) => !["delivered", "paid", "cancelled"].includes(order.status));
  if (visibleOrders.length === 0) {
    ordersContainer.innerHTML = "<p>No hay órdenes por ahora.</p>";
    return;
  }

  visibleOrders.forEach((order) => {
    const card = document.createElement("div");
    card.className = "order-card";

    const header = document.createElement("div");
    header.className = "order-header";
    const tableLabel = order.table === "PL" ? "Para llevar" : `Mesa ${order.table}`;
    header.innerHTML = `
      <div>
        <strong>${order.id.split("-").slice(-1)[0]}</strong>
        <div><strong>${tableLabel}</strong></div>
        <div class="small">${formatTime(order.createdAt)}</div>
      </div>
      <span class="badge ${order.status}">${order.status}</span>
    `;

    const items = document.createElement("div");
    items.className = "order-items";
    order.items.forEach((item) => {
      const line = document.createElement("div");
      line.className = "order-item";

      const imageSrc = getProductImage(item.productId);
      if (imageSrc) {
        const thumb = document.createElement("img");
        thumb.className = "item-thumb";
        thumb.src = imageSrc;
        thumb.alt = item.name;
        line.appendChild(thumb);
      }

      const info = document.createElement("div");
      info.className = "item-info";
      info.textContent = buildItemLine(item);

      if (item.meta && item.meta.spicy) {
        const spicyIcon = document.createElement("img");
        spicyIcon.className = "spicy-icon";
        spicyIcon.src = assetUrl(`/assets/menu/spicy_${item.meta.spicy}.png`);
        spicyIcon.alt = `Picante ${item.meta.spicy}`;
        info.appendChild(spicyIcon);
      }

      if (item.meta && item.meta.extras && item.meta.extras.length) {
        const extrasRow = document.createElement("div");
        extrasRow.className = "extra-icons";
        item.meta.extras.forEach((extra) => {
          const image = getProductImageByName(extra.name);
          if (!image) {
            return;
          }
          const count = Math.max(extra.qty || 1, 1);
          for (let i = 0; i < count; i += 1) {
            const extraIcon = document.createElement("img");
            extraIcon.className = "extra-icon";
            extraIcon.src = image;
            extraIcon.alt = extra.name;
            extrasRow.appendChild(extraIcon);
          }
        });
        if (extrasRow.childNodes.length) {
          info.appendChild(extrasRow);
        }
      }

      line.appendChild(info);
      items.appendChild(line);
    });

    const note = order.note || order.notes;
    if (note) {
      const notes = document.createElement("div");
      notes.className = "order-note";

      const badge = document.createElement("span");
      badge.className = "note-badge";
      badge.textContent = "NOTA";

      const text = document.createElement("span");
      text.className = "note-text";
      text.textContent = note;

      notes.append(badge, text);
      items.appendChild(notes);
    }

    const actions = document.createElement("div");
    actions.className = "order-actions";

    const preparingBtn = document.createElement("button");
    preparingBtn.className = "prepare";
    preparingBtn.textContent = "EN PREPARACIÓN";
    preparingBtn.addEventListener("click", () => updateStatus(order.id, "preparing"));

    const readyBtn = document.createElement("button");
    readyBtn.className = "ready";
    readyBtn.textContent = "LISTO";
    readyBtn.addEventListener("click", () => updateStatus(order.id, "ready"));

    actions.append(preparingBtn, readyBtn);

    card.append(header, items, actions);
    ordersContainer.appendChild(card);
  });
}

async function fetchOrders() {
  const response = await apiGet("/api/orders");
  orders = await response.json();
  renderOrders();
}

async function fetchMenu() {
  const response = await apiGet("/api/menu");
  const data = await response.json();
  const products = data.products || [];
  menuMap = new Map(products.map((product) => [product.id, product]));
  menuNameMap = new Map(products.map((product) => [product.name.toLowerCase(), product]));
}

async function updateStatus(id, status) {
  await fetch(apiUrl(`/api/orders/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}`);

  socket.addEventListener("open", () => {
    connectionStatus.textContent = "En vivo";
  });

  socket.addEventListener("close", () => {
    connectionStatus.textContent = "Desconectado";
    setTimeout(connectWebSocket, 2000);
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.event === "order:new") {
      orders.push(payload.data);
      renderOrders();
    }
    if (payload.event === "order:updated") {
      orders = orders.map((order) => order.id === payload.data.id ? payload.data : order);
      renderOrders();
    }
  });
}

async function init() {
  try {
    await fetchMenu();
    await fetchOrders();
  } catch (error) {
    console.error(error);
  }
  connectWebSocket();
}

init();
