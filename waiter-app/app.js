const state = {
  menu: [],
  activeCategory: "ramen",
  cart: [],
  promo: null,
  note: "",
  noteDraft: "",
  noteEditing: false,
  wizard: {
    open: false,
    step: 0,
    ramen: null
  }
};

const categoryTitles = {
  ramen: "Ramen",
  extras: "Extras",
  sides: "Acompañamientos",
  drinks: "Bebidas"
};

const categoryButtons = document.querySelectorAll(".category");
const productGrid = document.getElementById("productGrid");
const categoryTitle = document.getElementById("categoryTitle");
const cartItems = document.getElementById("cartItems");
const subtotalEl = document.getElementById("subtotal");
const totalEl = document.getElementById("total");
const orderStatus = document.getElementById("orderStatus");
const promoStatus = document.getElementById("promoStatus");
const promoToggle = document.getElementById("promoToggle");
const orderPrompt = document.getElementById("orderPrompt");
const orderFlowButton = document.getElementById("orderFlowButton");
const orderNextButton = document.getElementById("orderNextButton");
const sendOrderButton = document.getElementById("sendOrder");
const topBar = document.querySelector(".top-bar");

const backendInput = document.getElementById("backendInput")
  || document.getElementById("backend")
  || document.getElementById("backendUrl");
const saveBackend = document.getElementById("saveBackend");

const wizardModal = document.getElementById("ramenWizard");
const wizardStep = document.getElementById("wizardStep");
const wizardTitle = document.getElementById("wizardTitle");
const wizardBack = document.getElementById("wizardBack");
const wizardNext = document.getElementById("wizardNext");
const closeWizard = document.getElementById("closeWizard");
const tableSelect = document.getElementById("tableSelect");
const openHistory = document.getElementById("openHistory");
const historyModal = document.getElementById("historyModal");
const closeHistory = document.getElementById("closeHistory");
const historyList = document.getElementById("historyList");
const historyTicket = document.getElementById("historyTicket");
const historyStatus = document.getElementById("historyStatus");
const historyTable = document.getElementById("historyTable");
const historyDate = document.getElementById("historyDate");
const runCashClosing = document.getElementById("runCashClosing");
const cleanupTestOrdersButton = document.getElementById("cleanupTestOrders");
const historyCashClosing = document.getElementById("historyCashClosing");
const historyCashClosingDate = document.getElementById("historyCashClosingDate");
const historyCashClosingList = document.getElementById("historyCashClosingList");
const historyCashClosingTotal = document.getElementById("historyCashClosingTotal");

let historyOrders = [];
let activeHistoryOrderId = null;
let orderFlowStep = 0;
let historyViewMode = "active";
let historyToggleButton = null;
let activePanel = null;

// CSV Export button (admin)
function setupCsvExportButton() {
  try {
    var btn = document.getElementById('downloadCsv');
    if (!btn) return;
    btn.addEventListener('click', function() {
      try {
        var url = (BACKEND_BASE || '') + '/admin/export.csv?range=week';
        // Optional token support (if you later inject it in the page)
        if (window.ADMIN_EXPORT_TOKEN) {
          url += '&token=' + encodeURIComponent(String(window.ADMIN_EXPORT_TOKEN));
        }
        window.open(url, '_blank');
      } catch (e) {
        console.error('CSV export click error', e);
        alert('No se pudo descargar el CSV.');
      }
    });
  } catch (e) {
    console.error('setupCsvExportButton error', e);
  }
}

function setupItemsCsvExportButton() {
  try {
    var btn = document.getElementById('downloadItemsCsv');
    if (!btn) return;
    btn.addEventListener('click', function() {
      try {
        var url = (BACKEND_BASE || '') + '/admin/export-items.csv?range=week';
        if (window.ADMIN_EXPORT_TOKEN) {
          url += '&token=' + encodeURIComponent(String(window.ADMIN_EXPORT_TOKEN));
        }
        window.open(url, '_blank');
      } catch (e) {
        console.error('Items CSV export click error', e);
        alert('No se pudo descargar el CSV de comandas.');
      }
    });
  } catch (e) {
    console.error('setupItemsCsvExportButton error', e);
  }
}

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

let BACKEND_BASE = resolveBackendBase();
window.DEKU_CONFIG = window.DEKU_CONFIG || {};
window.DEKU_CONFIG.baseUrl = BACKEND_BASE;

function apiUrl(path) {
  return new URL(path, BACKEND_BASE).toString();
}

function apiGet(path) {
  return fetch(apiUrl(path));
}

function assetUrl(path) {
  return new URL(path, BACKEND_BASE).toString();
}

function formatPrice(value) {
  return `$${value.toFixed(0)}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getMenuByCategory(category) {
  return state.menu.filter((item) => item.category === category);
}

function getProductById(id) {
  return state.menu.find((item) => item.id === id);
}

function setStatus(message) {
  orderStatus.textContent = message;
  setTimeout(() => {
    if (orderStatus.textContent === message) {
      orderStatus.textContent = "";
    }
  }, 3000);
}

function renderCategories() {
  categoryButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.activeCategory);
  });
  categoryTitle.textContent = categoryTitles[state.activeCategory];
}

function renderProducts() {
  productGrid.innerHTML = "";
  renderActivePanel();
  const products = getMenuByCategory(state.activeCategory);

  products.forEach((product) => {
    const card = document.createElement("div");
    card.className = "product-card";

    const image = document.createElement("img");
    image.src = assetUrl(`/assets/menu/${product.image}`);
    image.alt = product.name;

    const name = document.createElement("h3");
    name.textContent = product.name;

    const price = document.createElement("p");
    price.className = "price";
    if (product.prices) {
      price.textContent = `M ${formatPrice(product.prices.M)} / G ${formatPrice(product.prices.G)}`;
    } else {
      price.textContent = formatPrice(product.price || 0);
    }

    card.append(image, name, price);

    if (product.category === "ramen") {
      const button = document.createElement("button");
      button.className = "primary";
      button.textContent = "Ordenar";
      button.addEventListener("click", () => openWizard(product));
      card.appendChild(button);
    } else {
      const qtyControl = buildQtyControl(product.id, getCartQty(product.id));
      card.appendChild(qtyControl);
    }

    productGrid.appendChild(card);
  });
}

function buildQtyControl(productId, qty) {
  const wrapper = document.createElement("div");
  wrapper.className = "qty-control";

  const minus = document.createElement("button");
  minus.textContent = "-";
  minus.addEventListener("click", () => adjustCartItem(productId, -1));

  const count = document.createElement("span");
  count.textContent = qty;

  const plus = document.createElement("button");
  plus.textContent = "+";
  plus.addEventListener("click", () => adjustCartItem(productId, 1));

  wrapper.append(minus, count, plus);
  return wrapper;
}

function getCartQty(productId) {
  const item = state.cart.find((entry) => entry.productId === productId && !entry.meta);
  return item ? item.qty : 0;
}

function adjustCartItem(productId, delta) {
  const product = getProductById(productId);
  if (!product) return;

  if (product.category === "extras") {
    const ramenItems = state.cart.filter((entry) => entry.meta);
    if (!ramenItems.length) {
      return setStatus("Agrega un ramen primero.");
    }
    let targetRamen = ramenItems[0];
    if (ramenItems.length > 1) {
      const options = ramenItems.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n");
      const response = prompt(`¿A qué ramen agregar ${product.name}?\n${options}`);
      const selection = Number(response);
      if (!Number.isInteger(selection) || selection < 1 || selection > ramenItems.length) {
        return;
      }
      targetRamen = ramenItems[selection - 1];
    }
    targetRamen.meta.extras = targetRamen.meta.extras || [];
    const existingExtra = targetRamen.meta.extras.find((extra) => extra.productId === product.id);
    let appliedDelta = 0;
    if (existingExtra) {
      existingExtra.qty += delta;
      appliedDelta = delta;
      if (existingExtra.qty <= 0) {
        targetRamen.meta.extras = targetRamen.meta.extras.filter((extra) => extra !== existingExtra);
      }
    } else if (delta > 0) {
      targetRamen.meta.extras.push({
        productId: product.id,
        name: product.name,
        qty: delta,
        unitPrice: product.price
      });
      appliedDelta = delta;
    } else {
      return;
    }
    const adjustment = product.price * appliedDelta;
    const minPrice = typeof targetRamen.basePrice === "number" ? targetRamen.basePrice : 0;
    targetRamen.unitPrice = Math.max(minPrice, targetRamen.unitPrice + adjustment);
    renderCart();
    renderProducts();
    return;
  }

  let item = state.cart.find((entry) => entry.productId === productId && !entry.meta);
  if (!item && delta > 0) {
    item = {
      id: `cart-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      productId: product.id,
      name: product.name,
      qty: 0,
      unitPrice: product.price || 0
    };
    state.cart.push(item);
  }

  if (item) {
    item.qty += delta;
    if (item.qty <= 0) {
      state.cart = state.cart.filter((entry) => entry !== item);
    }
  }

  renderProducts();
  renderCart();
}

function renderCart() {
  cartItems.innerHTML = "";

  if (state.cart.length === 0) {
    cartItems.innerHTML = "<p>No hay items aún.</p>";
  }

  state.cart.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "cart-item";

    const header = document.createElement("div");
    header.className = "cart-item-header";

    const title = document.createElement("strong");
    title.textContent = item.name;

    const price = document.createElement("span");
    price.textContent = formatPrice(item.unitPrice * item.qty);

    header.append(title, price);

    if (item.meta) {
      const detail = document.createElement("small");
      detail.textContent = buildRamenDetail(item.meta);

      const removeBtn = document.createElement("button");
      removeBtn.className = "ghost";
      removeBtn.textContent = "Quitar";
      removeBtn.addEventListener("click", () => removeCartItem(item.id));

      wrapper.append(header, detail, removeBtn);
    } else {
      const controls = buildQtyControl(item.productId, item.qty);
      wrapper.append(header, controls);
    }

    cartItems.appendChild(wrapper);
  });

  renderNoteSection();

  const totals = calculateTotals();
  subtotalEl.textContent = formatPrice(totals.subtotal);
  totalEl.textContent = formatPrice(totals.total);
}

function renderNoteSection() {
  const hasNote = Boolean(state.note && state.note.trim());
  if (state.cart.length === 0 && !state.noteEditing && !hasNote) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "cart-item note-card";

  const header = document.createElement("div");
  header.className = "note-header";

  const title = document.createElement("strong");
  title.textContent = "Nota";

  const actions = document.createElement("div");
  actions.className = "note-actions";

  if (state.noteEditing) {
    const saveBtn = document.createElement("button");
    saveBtn.className = "ghost note-button";
    saveBtn.textContent = "Guardar";
    saveBtn.addEventListener("click", () => {
      const value = (state.noteDraft || "").trim();
      state.note = value;
      state.noteDraft = value;
      state.noteEditing = false;
      renderCart();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghost note-button";
    removeBtn.textContent = "Quitar nota";
    removeBtn.addEventListener("click", () => {
      state.note = "";
      state.noteDraft = "";
      state.noteEditing = false;
      renderCart();
    });

    actions.append(saveBtn, removeBtn);
  } else if (hasNote) {
    const editBtn = document.createElement("button");
    editBtn.className = "ghost note-button";
    editBtn.textContent = "Editar nota";
    editBtn.addEventListener("click", () => {
      state.noteEditing = true;
      state.noteDraft = state.note;
      renderCart();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghost note-button";
    removeBtn.textContent = "Quitar nota";
    removeBtn.addEventListener("click", () => {
      state.note = "";
      state.noteDraft = "";
      renderCart();
    });

    actions.append(editBtn, removeBtn);
  } else {
    const addBtn = document.createElement("button");
    addBtn.className = "ghost note-button";
    addBtn.textContent = "Agregar nota";
    addBtn.addEventListener("click", () => {
      state.noteEditing = true;
      state.noteDraft = "";
      renderCart();
    });

    actions.appendChild(addBtn);
  }

  header.append(title, actions);
  wrapper.appendChild(header);

  if (state.noteEditing) {
    const textarea = document.createElement("textarea");
    textarea.className = "note-textarea";
    textarea.placeholder = "Escribe una nota para cocina...";
    textarea.value = state.noteDraft || "";
    textarea.addEventListener("input", (event) => {
      state.noteDraft = event.target.value;
    });
    wrapper.appendChild(textarea);
  } else if (hasNote) {
    const noteText = document.createElement("div");
    noteText.className = "note-text";
    noteText.textContent = state.note;
    wrapper.appendChild(noteText);
  }

  cartItems.appendChild(wrapper);
}

function renderPromoStatus() {
  if (!promoStatus) return;
  if (promoToggle) {
    promoToggle.classList.add("promo-toggle");
  }
  if (!state.promo) {
    promoStatus.textContent = "PROMO 2x1: INACTIVA";
    if (promoToggle) {
      promoToggle.textContent = "2x1";
      promoToggle.classList.remove("promo-toggle-active");
    }
    return;
  }
  if (state.promo.promoActive) {
    const label = state.promo.promoSource === "auto_thursday"
      ? "PROMO 2x1: ACTIVA (AUTO JUEVES)"
      : "PROMO 2x1: ACTIVA (OVERRIDE)";
    promoStatus.textContent = label;
  } else {
    promoStatus.textContent = "PROMO 2x1: INACTIVA";
  }
  if (promoToggle) {
    promoToggle.textContent = "2x1";
    promoToggle.classList.toggle("promo-toggle-active", state.promo.manualOverrideEnabled);
  }
}

async function fetchPromoStatus() {
  if (!promoStatus) return;
  try {
    const response = await apiGet("/api/promo");
    if (!response.ok) {
      throw new Error("No se pudo cargar promo");
    }
    state.promo = await response.json();
    renderPromoStatus();
  } catch (error) {
    console.error(error);
    promoStatus.textContent = "PROMO 2x1: INACTIVA";
  }
}

async function togglePromoOverride() {
  if (!promoToggle) return;
  const nextEnabled = !(state.promo && state.promo.manualOverrideEnabled);
  try {
    const response = await fetch(apiUrl("/api/promo/override"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data && data.error ? data.error : "No se pudo actualizar promo.";
      alert(message);
      return;
    }
    state.promo = await response.json();
    renderPromoStatus();
  } catch (error) {
    console.error(error);
    alert("No se pudo actualizar promo.");
  }
}

function removeCartItem(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  renderCart();
  renderProducts();
}

function calculateTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  
  const promoActive = Boolean(state.promo && state.promo.promoActive);
  let promoDiscount = 0;
  
  if (promoActive) {
    // Expandir cada ramen según su qty y extraer basePrice
    const ramenBasePrices = [];
    
    state.cart.forEach((item) => {
      // Solo procesar items con meta (configurados como ramen)
      if (!item.meta || !item.meta.size) return;
      
      // Calcular basePrice a partir de unitPrice - extras
      let basePrice = item.unitPrice;
      
      if (item.meta.extras && Array.isArray(item.meta.extras)) {
        const extrasTotal = item.meta.extras.reduce((sum, extra) => {
          const extraUnit = typeof extra.unitPrice === "number" ? extra.unitPrice : 0;
          const extraQty = typeof extra.qty === "number" ? extra.qty : 0;
          return sum + (extraUnit * extraQty);
        }, 0);
        basePrice = item.unitPrice - extrasTotal;
      }
      
      // Si ya tiene basePrice guardado, usarlo (más confiable)
      if (typeof item.basePrice === "number" && Number.isFinite(item.basePrice)) {
        basePrice = item.basePrice;
      }
      
      // Expandir: agregar basePrice tantas veces como qty
      const qty = typeof item.qty === "number" ? item.qty : 1;
      for (let i = 0; i < qty; i++) {
        ramenBasePrices.push(basePrice);
      }
    });
    
    // Ordenar de menor a mayor
    ramenBasePrices.sort((a, b) => a - b);
    
    // Calcular pares y descuento
    const pairs = Math.floor(ramenBasePrices.length / 2);
    for (let i = 0; i < pairs; i++) {
      promoDiscount += ramenBasePrices[i];
    }
  }
  
  return {
    subtotal,
    total: promoDiscount > 0 ? Math.max(0, subtotal - promoDiscount) : subtotal
  };
}

function buildRamenDetail(meta) {
  const extras = meta.extras && meta.extras.length
    ? ` | Extras: ${meta.extras.map((extra) => `${extra.name} x${extra.qty}`).join(", ")}`
    : "";
  return `Tamaño ${meta.size} · Picante ${meta.spicy}${extras}`;
}

function getSpicyOptions() {
  const spicyOptions = getMenuByCategory("spicy");
  if (spicyOptions.some((option) => option.id === "spicy_0")) {
    return spicyOptions;
  }
  return [
    {
      id: "spicy_0",
      name: "Picante 0",
      category: "spicy"
    },
    ...spicyOptions
  ];
}

function openWizard(ramen) {
  state.wizard.open = true;
  state.wizard.step = 0;
  state.wizard.ramen = {
    base: ramen,
    size: null,
    spicy: null,
    extras: {}
  };
  wizardTitle.textContent = ramen.name;
  wizardModal.classList.remove("hidden");
  renderWizardStep();
}

function closeWizardModal() {
  state.wizard.open = false;
  wizardModal.classList.add("hidden");
}

function renderWizardStep() {
  const { ramen, step } = state.wizard;
  wizardStep.innerHTML = "";
  wizardBack.disabled = step === 0;

  if (!ramen) return;

  if (step === 0) {
    wizardStep.innerHTML = `
      <h3>1. Elige tamaño</h3>
      <div class="option-grid">
        ${["M", "G"].map((size) => `
          <div class="option-card ${ramen.size === size ? "selected" : ""}" data-size="${size}">
            <h4>${size === "M" ? "Mediano" : "Grande"}</h4>
            <p class="price">${formatPrice(ramen.base.prices[size])}</p>
          </div>
        `).join("")}
      </div>
    `;
    wizardNext.textContent = "Siguiente";
  }

  if (step === 1) {
    const spicyOptions = getSpicyOptions();
    wizardStep.innerHTML = `
      <h3>2. Elige picante</h3>
      <div class="option-grid">
        ${spicyOptions.map((option) => `
          <div class="option-card ${ramen.spicy === Number(option.id.split("_")[1]) ? "selected" : ""}" data-spicy="${option.id}">
            ${option.image ? `<img src="${assetUrl(`/assets/menu/${option.image}`)}" alt="${option.name}" />` : ""}
            <h4>${option.name}</h4>
          </div>
        `).join("")}
      </div>
    `;
    wizardNext.textContent = "Siguiente";
  }

  if (step === 2) {
    const extras = getMenuByCategory("extras");
    wizardStep.innerHTML = `
      <h3>3. Agrega extras</h3>
      <div class="option-grid">
        ${extras.map((extra) => {
          const qty = ramen.extras[extra.id] || 0;
          return `
            <div class="option-card">
              <img src="${assetUrl(`/assets/menu/${extra.image}`)}" alt="${extra.name}" />
              <h4>${extra.name}</h4>
              <p class="price">${formatPrice(extra.price)}</p>
              <div class="qty-control" data-extra="${extra.id}">
                <button class="extra-minus">-</button>
                <span>${qty}</span>
                <button class="extra-plus">+</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    wizardNext.textContent = "Siguiente";
  }

  if (step === 3) {
    const extrasList = Object.entries(ramen.extras)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const extra = getProductById(id);
        return `${extra.name} x${qty}`;
      });

    wizardStep.innerHTML = `
      <h3>4. Confirmar ramen</h3>
      <p><strong>Tamaño:</strong> ${ramen.size === "M" ? "Mediano" : "Grande"}</p>
      <p><strong>Picante:</strong> ${ramen.spicy}</p>
      <p><strong>Extras:</strong> ${extrasList.length ? extrasList.join(", ") : "Sin extras"}</p>
    `;
    wizardNext.textContent = "Agregar al carrito";
  }
}

wizardStep.addEventListener("click", (event) => {
  const sizeCard = event.target.closest(".option-card[data-size]");
  const spicyCard = event.target.closest(".option-card[data-spicy]");

  if (sizeCard && state.wizard.step === 0) {
    state.wizard.ramen.size = sizeCard.dataset.size;
    renderWizardStep();
  }

  if (spicyCard && state.wizard.step === 1) {
    const level = Number(spicyCard.dataset.spicy.split("_")[1]);
    state.wizard.ramen.spicy = level;
    renderWizardStep();
  }

  if (state.wizard.step === 2) {
    const extraControl = event.target.closest(".qty-control");
    if (extraControl) {
      const extraId = extraControl.dataset.extra;
      if (event.target.classList.contains("extra-plus")) {
        state.wizard.ramen.extras[extraId] = (state.wizard.ramen.extras[extraId] || 0) + 1;
      }
      if (event.target.classList.contains("extra-minus")) {
        state.wizard.ramen.extras[extraId] = Math.max((state.wizard.ramen.extras[extraId] || 0) - 1, 0);
      }
      renderWizardStep();
    }
  }
});

wizardBack.addEventListener("click", () => {
  if (state.wizard.step > 0) {
    state.wizard.step -= 1;
    renderWizardStep();
  }
});

wizardNext.addEventListener("click", () => {
  const { step, ramen } = state.wizard;

  if (step === 0 && !ramen.size) {
    return setStatus("Selecciona un tamaño.");
  }

  if (step === 1 && (ramen.spicy === null || ramen.spicy === undefined)) {
    return setStatus("Selecciona nivel de picante.");
  }

  if (step < 3) {
    state.wizard.step += 1;
    renderWizardStep();
    return;
  }

  addRamenToCart();
  closeWizardModal();
});

closeWizard.addEventListener("click", closeWizardModal);

function addRamenToCart() {
  const ramen = state.wizard.ramen;
  if (!ramen) return;

  const extras = Object.entries(ramen.extras)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const extra = getProductById(id);
      return {
        productId: extra.id,
        name: extra.name,
        qty,
        unitPrice: extra.price
      };
    });

  const extrasTotal = extras.reduce((sum, extra) => sum + extra.unitPrice * extra.qty, 0);
  const basePrice = ramen.base.prices[ramen.size];

  state.cart.push({
    id: `ramen-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    productId: ramen.base.id,
    name: ramen.base.name,
    qty: 1,
    basePrice,
    unitPrice: basePrice + extrasTotal,
    meta: {
      size: ramen.size,
      spicy: ramen.spicy,
      extras
    }
  });

  renderCart();
}

async function sendOrder() {
  if (orderFlowStep === 0) {
    orderFlowStep = 1;
    state.activeCategory = "sides";
    renderCategories();
    renderProducts();
    updateOrderFlowUI();
    try {
      var el = document.getElementById('categoryTitle');
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e) {
      try { window.scrollTo(0, 0); } catch (_) {}
    }
    return;
  }
  if (orderFlowStep === 1) {
    orderFlowStep = 2;
    state.activeCategory = "drinks";
    renderCategories();
    renderProducts();
    updateOrderFlowUI();
    try {
      var el2 = document.getElementById('categoryTitle');
      if (el2 && el2.scrollIntoView) {
        el2.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e) {
      try { window.scrollTo(0, 0); } catch (_) {}
    }
    return;
  }
  if (!tableSelect || !tableSelect.value) {
    setStatus("Selecciona mesa o Para llevar.");
    return;
  }
  if (state.cart.length === 0) {
    setStatus("Agrega productos antes de enviar.");
    return;
  }
  const totals = calculateTotals();
  const items = state.cart.map((item) => {
    if (item.meta) {
      const extrasTotal = (item.meta && Array.isArray(item.meta.extras))
        ? item.meta.extras.reduce((sum, extra) => {
          const extraUnit = typeof extra.unitPrice === "number" ? extra.unitPrice : 0;
          const extraQty = typeof extra.qty === "number" ? extra.qty : 0;
          return sum + extraQty * extraUnit;
        }, 0)
        : 0;
      const basePrice = typeof item.basePrice === "number"
        ? item.basePrice
        : Math.max(0, item.unitPrice - extrasTotal);
      return {
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        basePrice,
        unitPrice: item.unitPrice,
        meta: item.meta || {}
      };
    }
    return {
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      basePrice: item.basePrice,
      unitPrice: item.unitPrice,
      meta: item.meta || {}
    };
  });
  const payload = {
    items,
    totals,
    table: tableSelect.value
  };
  const note = state.note && state.note.trim() ? state.note.trim() : "";
  if (note) {
    payload.note = note;
  }

  try {
    const response = await fetch(apiUrl("/api/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Error al enviar la orden");
    }

    state.cart = [];
    state.note = "";
    state.noteDraft = "";
    state.noteEditing = false;
    if (tableSelect) {
      tableSelect.value = "";
    }
    orderFlowStep = 0;
    renderCart();
    renderProducts();
    updateOrderFlowUI();
    setStatus("Orden enviada a cocina.");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo enviar. Revisa conexión.");
  }
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeCategory = button.dataset.category;
    renderCategories();
    renderProducts();
  });
});

if (saveBackend && backendInput) {
  saveBackend.addEventListener("click", () => {
    const value = backendInput.value.trim();
    if (value) {
      const normalized = normalizeBase(value);
      if (!normalized) {
        return setStatus("URL inválida. Usa http://IP:3000");
      }
      localStorage.setItem("backendUrl", normalized);
      BACKEND_BASE = normalized;
      window.DEKU_CONFIG.baseUrl = normalized;
      backendInput.value = normalized;
      setStatus("URL backend guardada.");
    }
  });
}

if (backendInput) {
  backendInput.value = BACKEND_BASE;
}

function buildTableLabel(value) {
  return value === "PL" ? "Para llevar" : `Mesa ${value}`;
}

function getLocalDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOrderDateKey(order) {
  return getLocalDateKey(order.createdAt || order.timestamp || order.updatedAt);
}

function ensureHistoryDateDefault() {
  if (!historyDate || historyDate.value) return;
  historyDate.value = getLocalDateKey(new Date().toISOString());
}

function getFilteredHistoryOrders() {
  let filtered = [...historyOrders];
  const tableFilter = historyTable ? historyTable.value : "";
  const dateFilter = historyDate ? historyDate.value : "";
  if (historyViewMode === "active") {
    filtered = filtered.filter((order) => ["pending", "preparing", "ready", "delivered"].includes(order.status));
  } else {
    filtered = filtered.filter((order) => ["paid", "cancelled"].includes(order.status));
  }
  if (tableFilter) {
    filtered = filtered.filter((order) => order.table === tableFilter);
  }
  if (dateFilter) {
    filtered = filtered.filter((order) => getOrderDateKey(order) === dateFilter);
  }
  return filtered;
}

function getCashClosingOrdersByDate(dateKey) {
  if (!dateKey) return [];
  return historyOrders.filter((order) => order.status === "paid" && getOrderDateKey(order) === dateKey);
}

function hideCashClosingSummary() {
  if (!historyCashClosing) return;
  historyCashClosing.classList.add("hidden");
  if (historyCashClosingDate) {
    historyCashClosingDate.textContent = "";
  }
  if (historyCashClosingList) {
    historyCashClosingList.innerHTML = "";
  }
  if (historyCashClosingTotal) {
    historyCashClosingTotal.textContent = formatPrice(0);
  }
}

function renderCashClosingSummary() {
  if (!historyDate || !historyCashClosing || !historyCashClosingList || !historyCashClosingTotal) return;
  const dateKey = historyDate.value;
  const orders = getCashClosingOrdersByDate(dateKey);
  const lines = orders.map((order) => {
    const total = calculateOrderTotal(order);
    return `
      <div class="history-cash-line">
        <span>${buildTableLabel(order.table)}</span>
        <span>${formatTime(order.createdAt)}</span>
        <strong>${formatPrice(total)}</strong>
      </div>
    `;
  }).join("");
  historyCashClosing.classList.remove("hidden");
  if (historyCashClosingDate) {
    historyCashClosingDate.textContent = `Fecha: ${dateKey}`;
  }
  historyCashClosingList.innerHTML = lines || "<p>No hay comandas pagadas para esta fecha.</p>";
  const total = orders.reduce((sum, order) => sum + calculateOrderTotal(order), 0);
  historyCashClosingTotal.textContent = formatPrice(total);
}

function renderHistoryList(orders) {
  historyList.innerHTML = "";
  historyTicket.innerHTML = "";
  if (!orders.length) {
    historyList.innerHTML = "<p>No hay órdenes.</p>";
    return;
  }
  orders.forEach((order) => {
    const item = document.createElement("div");
    item.className = "cart-item history-order-card";
    const shortId = order.id.split("-").slice(-1)[0];
    const statusLabel = order.status.toUpperCase();
    const orderTotal = calculateOrderTotal(order);
    item.innerHTML = `
      <div class="cart-item-header">
        <strong>${buildTableLabel(order.table)}</strong>
        <span>${formatPrice(orderTotal)}</span>
      </div>
      <small>${formatTime(order.createdAt)} · ${statusLabel} · ${shortId}</small>
    `;
    if (historyViewMode === "active") {
      const actions = document.createElement("div");
      const actionBtn = document.createElement("button");
      actionBtn.className = "primary history-action";
      if (order.status === "ready") {
        actionBtn.textContent = "MARCAR ENTREGADA";
        actionBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          updateHistoryStatus(order.id, "delivered");
        });
      } else if (order.status === "delivered") {
        actionBtn.textContent = "PENDIENTE DE PAGO";
        actionBtn.disabled = true;
      } else {
        actionBtn.textContent = "EN PREPARACIÓN";
        actionBtn.disabled = true;
      }
      actions.appendChild(actionBtn);
      item.appendChild(actions);
    }
    item.addEventListener("click", () => renderHistoryTicket(order));
    historyList.appendChild(item);
  });
}

function calculateOrderTotal(order) {
  if (order.totals && typeof order.totals.total === "number") {
    return order.totals.total;
  }
  return order.items.reduce((sum, item) => {
    const lineTotal = item.qty * item.unitPrice;
    const extrasTotal = (item.meta && Array.isArray(item.meta.extras))
      ? item.meta.extras.reduce((extraSum, extra) => {
        const extraUnit = typeof extra.unitPrice === "number" ? extra.unitPrice : 0;
        const extraQty = typeof extra.qty === "number" ? extra.qty : 0;
        return extraSum + extraQty * extraUnit;
      }, 0)
      : 0;
    return sum + lineTotal + extrasTotal;
  }, 0);
}

function renderHistoryTicket(order) {
  activeHistoryOrderId = order.id;
  const headerLine = "<div>qty | concepto | unit | importe</div>";
  const lines = order.items.map((item) => {
    const lineTotal = item.qty * item.unitPrice;
    const size = item.meta && item.meta.size ? ` ${item.meta.size}` : "";
    const spicy = item.meta && item.meta.spicy !== null && item.meta.spicy !== undefined ? ` Picante ${item.meta.spicy}` : "";
    
    // Construir nombre con extras incluidos en UNA SOLA LÍNEA
    let displayName = `${item.name}${size}${spicy}`;
    
    if (item.meta && item.meta.extras && item.meta.extras.length > 0) {
      const extraNames = item.meta.extras.map(e => e.name).join(' + ');
      displayName = `${displayName} + ${extraNames}`;
    }
    
    const mainLine = `<div>${item.qty} | ${displayName} | ${formatPrice(item.unitPrice)} | ${formatPrice(lineTotal)}</div>`;
    
    return mainLine;
  }).join("");

  const total = calculateOrderTotal(order);
  const statusLabel = order.status.toUpperCase();
  const cancelled = order.status === "cancelled";
  const cancelReason = order.cancelReason ? `Motivo: ${order.cancelReason}` : "";
  let promoLine = "";
  if (order.promoApplied) {
    const promoDiscount = order.promoDiscount || (order.totals.subtotal - order.totals.total);
    promoLine = "<div><br>PROMO 2x1 JUEVES APLICADA</div>";
    promoLine += `<div>Descuento (ramen más económico): -${formatPrice(promoDiscount)}</div><br>`;
  }

  historyTicket.innerHTML = `
    <strong>DEKU RAMEN</strong>
    <div>${buildTableLabel(order.table)} · ${formatTime(order.createdAt)} · ${order.id.split("-").slice(-1)[0]}</div>
    <div>Estado: ${statusLabel}</div>
    ${cancelled ? `<div><strong>CANCELADA</strong></div>` : ""}
    ${cancelled && cancelReason ? `<div>${cancelReason}</div>` : ""}
    <div>${headerLine}</div>
    <div>${lines}</div>
    ${promoLine}
    <div><strong>TOTAL:</strong> ${formatPrice(total)}</div>
  `;

  const actions = document.createElement("div");
  actions.className = "cart-item";

  if (order.status === "ready") {
    const deliveredBtn = document.createElement("button");
    deliveredBtn.className = "primary";
    deliveredBtn.textContent = "Marcar ENTREGADA";
    deliveredBtn.addEventListener("click", () => updateHistoryStatus(order.id, "delivered"));
    actions.appendChild(deliveredBtn);
  }

  if (order.status === "delivered") {
    const paidBtn = document.createElement("button");
    paidBtn.className = "primary";
    paidBtn.textContent = "Marcar PAGADA";
    paidBtn.addEventListener("click", () => updateHistoryStatus(order.id, "paid"));
    actions.appendChild(paidBtn);
  }

  if (order.status !== "paid") {
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ghost";
    cancelBtn.textContent = "CANCELAR";
    cancelBtn.addEventListener("click", () => cancelHistoryOrder(order.id));
    actions.appendChild(cancelBtn);
  }

  historyTicket.appendChild(actions);
}

function renderPaymentPreviewTicket(order) {
  if (!order) return;

  cartItems.innerHTML = "";
  const items = Array.isArray(order.items) ? order.items : [];

  items.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "cart-item";

    const header = document.createElement("div");
    header.className = "cart-item-header";

    const title = document.createElement("strong");
    title.textContent = `${item.qty}x ${item.name}`;

    const lineTotal = (item.qty || 0) * (item.unitPrice || 0);
    const price = document.createElement("span");
    price.textContent = formatPrice(lineTotal);

    header.append(title, price);
    wrapper.appendChild(header);

    if (item.meta) {
      const detail = document.createElement("small");
      detail.textContent = buildRamenDetail(item.meta);
      wrapper.appendChild(detail);
    }

    cartItems.appendChild(wrapper);
  });

  const subtotal = order.totals && typeof order.totals.subtotal === "number"
    ? order.totals.subtotal
    : calculateOrderTotal(order);
  const total = calculateOrderTotal(order);
  subtotalEl.textContent = formatPrice(subtotal);
  totalEl.textContent = formatPrice(total);

  const actions = document.createElement("div");
  actions.className = "cart-item";

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "primary";
  confirmBtn.textContent = "CONFIRMAR PAGO";
  confirmBtn.addEventListener("click", async () => {
    await updateHistoryStatus(order.id, "paid");
    await fetchHistoryOrders();
    renderActivePanel();
    renderCart();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "ghost";
  cancelBtn.textContent = "Cancelar";
  cancelBtn.addEventListener("click", () => renderCart());

  actions.append(confirmBtn, cancelBtn);
  cartItems.appendChild(actions);
}

function getActivePanelOrders() {
  return historyOrders.filter((order) => ["pending", "preparing", "ready", "delivered"].includes(order.status));
}

function renderActivePanel() {
  if (!productGrid) return;
  if (!activePanel) {
    activePanel = document.createElement("div");
    activePanel.className = "active-panel";
    productGrid.insertAdjacentElement("afterend", activePanel);
  }
  const activeOrders = getActivePanelOrders();
  if (!activeOrders.length) {
    activePanel.innerHTML = "";
    activePanel.classList.add("hidden");
    return;
  }
  activePanel.classList.remove("hidden");
  const cards = activeOrders.map((order) => {
    const shortId = order.id.split("-").slice(-1)[0];
    const statusLabel = order.status.toUpperCase();
    const items = order.items.map((item) => {
      const size = item.meta && item.meta.size ? ` ${item.meta.size}` : "";
      const spicy = item.meta && item.meta.spicy !== null && item.meta.spicy !== undefined ? ` Picante ${item.meta.spicy}` : "";
      let displayName = `${item.name}${size}${spicy}`;
      if (item.meta && item.meta.extras && item.meta.extras.length > 0) {
        const extraNames = item.meta.extras.map((extra) => extra.name).join(" + ");
        displayName = `${displayName} + ${extraNames}`;
      }
      return `${item.qty}x ${displayName}`;
    }).join(" · ");
    let label = "EN PREPARACIÓN";
    if (order.status === "ready") {
      label = "LISTO (ENTREGAR)";
    } else if (order.status === "delivered") {
      label = "MARCAR PAGADA";
    }
    const actionClass = order.status === "ready"
      ? "action-ready"
      : order.status === "delivered"
        ? "action-pay"
        : "action-pending";
    return `
      <div class="active-panel-card" data-order="${order.id}">
        <div class="active-panel-header">
          <strong>${buildTableLabel(order.table)}</strong>
          <span>${formatTime(order.createdAt)} · ${statusLabel} · ${shortId}</span>
        </div>
        <div class="active-panel-items">${items}</div>
        <button class="primary active-panel-action ${actionClass}">${label}</button>
      </div>
    `;
  }).join("");
  activePanel.innerHTML = `
    <div class="active-panel-title">COMANDAS ACTIVAS</div>
    <div class="active-panel-list">${cards}</div>
  `;
  activePanel.querySelectorAll(".active-panel-card").forEach((card) => {
    const orderId = card.dataset.order;
    const order = activeOrders.find((item) => item.id === orderId);
    const button = card.querySelector(".active-panel-action");
    if (!order || !button) return;
    if (order.status === "ready") {
      button.addEventListener("click", async () => {
        await updateHistoryStatus(order.id, "delivered");
        await fetchHistoryOrders();
        renderActivePanel();
      });
    } else if (order.status === "delivered") {
      button.addEventListener("click", () => renderPaymentPreviewTicket(order));
    } else {
      button.disabled = true;
    }
  });
}

async function openHistoryForOrder(orderId) {
  historyModal.classList.remove("hidden");
  try {
    ensureHistoryDateDefault();
    await fetchHistoryOrders();
    refreshHistoryView();
    const current = historyOrders.find((order) => order.id === orderId);
    if (current) {
      renderHistoryTicket(current);
    }
  } catch (error) {
    console.error(error);
    historyList.innerHTML = "<p>No se pudo cargar historial.</p>";
  }
}

async function fetchHistoryOrders() {
  const response = await apiGet("/api/orders");
  historyOrders = await response.json();
}

function refreshHistoryView() {
  ensureHistoryDateDefault();
  hideCashClosingSummary();
  const filtered = getFilteredHistoryOrders();
  renderHistoryList(filtered);
  updateHistoryDailyTotal(filtered);
  renderActivePanel();
  if (activeHistoryOrderId) {
    const current = historyOrders.find((order) => order.id === activeHistoryOrderId);
    if (current) {
      renderHistoryTicket(current);
    }
  }
}

async function updateHistoryStatus(orderId, status, extra = {}) {
  try {
    const response = await fetch(apiUrl(`/api/orders/${orderId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra })
    });
    if (!response.ok) {
      throw new Error("No se pudo actualizar");
    }
    await fetchHistoryOrders();
    refreshHistoryView();
  } catch (error) {
    console.error(error);
  }
}

function cancelHistoryOrder(orderId) {
  const reason = prompt("Motivo de cancelación");
  if (!reason) {
    return;
  }
  updateHistoryStatus(orderId, "cancelled", { cancelReason: reason });
}

async function openHistoryModal() {
  historyModal.classList.remove("hidden");
  ensureHistoryDateDefault();
  hideCashClosingSummary();
  if (historyStatus && historyStatus.parentElement && !historyToggleButton) {
    historyToggleButton = document.createElement("button");
    historyToggleButton.className = "primary history-toggle";
    historyToggleButton.textContent = "ACTIVAS";
    historyToggleButton.addEventListener("click", () => {
      historyViewMode = historyViewMode === "active" ? "history" : "active";
      historyToggleButton.textContent = historyViewMode === "active" ? "ACTIVAS" : "HISTORIAL";
      refreshHistoryView();
    });
    historyStatus.parentElement.insertBefore(historyToggleButton, historyStatus);
  }
  try {
    await fetchHistoryOrders();
    refreshHistoryView();
  } catch (error) {
    console.error(error);
    historyList.innerHTML = "<p>No se pudo cargar historial.</p>";
  }
}

function closeHistoryModal() {
  historyModal.classList.add("hidden");
  activeHistoryOrderId = null;
  hideCashClosingSummary();
}

async function cleanupTestOrders() {
  ensureHistoryDateDefault();
  if (!historyDate || !historyDate.value) {
    return setStatus("Selecciona una fecha para limpiar pruebas.");
  }
  const confirmation = prompt(`Escribe LIMPIAR para borrar comandas de prueba del día ${historyDate.value}`);
  if (confirmation !== "LIMPIAR") {
    return;
  }
  try {
    const response = await fetch(apiUrl("/api/orders/cleanup-tests"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmText: "LIMPIAR",
        date: historyDate.value
      })
    });
    if (!response.ok) {
      throw new Error("No se pudo limpiar pruebas");
    }
    await fetchHistoryOrders();
    refreshHistoryView();
    setStatus("Comandas de prueba eliminadas.");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo limpiar comandas de prueba.");
  }
}

if (openHistory) {
  openHistory.addEventListener("click", openHistoryModal);
}

if (closeHistory) {
  closeHistory.addEventListener("click", closeHistoryModal);
}

if (historyStatus) {
  historyStatus.addEventListener("change", refreshHistoryView);
}

if (historyTable) {
  historyTable.addEventListener("change", refreshHistoryView);
}

if (historyDate) {
  historyDate.addEventListener("change", refreshHistoryView);
}

if (runCashClosing) {
  runCashClosing.addEventListener("click", () => {
    ensureHistoryDateDefault();
    renderCashClosingSummary();
  });
}

if (cleanupTestOrdersButton) {
  cleanupTestOrdersButton.addEventListener("click", cleanupTestOrders);
}

if (promoToggle) {
  promoToggle.addEventListener("click", togglePromoOverride);
}

function updateOrderFlowUI() {
  if (!sendOrderButton) return;
  if (orderFlowButton) {
    orderFlowButton.style.display = "none";
  }
  if (orderNextButton) {
    orderNextButton.style.display = "none";
  }
  if (orderFlowStep === 0) {
    sendOrderButton.textContent = "ORDENAR";
    if (orderPrompt) {
      orderPrompt.textContent = "";
    }
    return;
  }
  if (orderFlowStep === 1) {
    sendOrderButton.textContent = "ORDENAR";
    if (orderPrompt) {
      orderPrompt.textContent = "¿Desean acompañamientos?";
    }
    return;
  }
  if (orderFlowStep === 2) {
    sendOrderButton.textContent = "ENVIAR A COCINA";
    if (orderPrompt) {
      orderPrompt.textContent = "¿Desean bebidas?";
    }
  }
}

async function init() {
  if (topBar) {
    const actions = topBar.querySelector(".settings") || topBar;
    const logoutButton = document.createElement("button");
    logoutButton.type = "button";
    logoutButton.className = "ghost logout-button";
    logoutButton.textContent = "Cerrar sesión";
    logoutButton.addEventListener("click", () => {
      window.location.href = "/logout";
    });
    actions.appendChild(logoutButton);
  }
  try {
    const response = await apiGet("/api/menu");
    const data = await response.json();
    state.menu = data.products || [];
    renderCategories();
    renderProducts();
    renderCart();
  } catch (error) {
    console.error(error);
    setStatus("No se pudo cargar menú.");
  }

  fetchPromoStatus();
  updateOrderFlowUI();
  fetchHistoryOrders().then(renderActivePanel).catch(() => {});
  if (tableSelect) {
    const placeholder = tableSelect.querySelector('option[value=""]');
    if (placeholder) {
      placeholder.textContent = "Mesa";
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((error) => console.error(error));
  }

  setupCsvExportButton();
  setupItemsCsvExportButton();
}

init();

if (sendOrderButton) {
  sendOrderButton.addEventListener("click", sendOrder);
}

setInterval(() => {
  fetchHistoryOrders().then(renderActivePanel).catch(() => {});
}, 5000);
