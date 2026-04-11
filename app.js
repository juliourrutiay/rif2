const API_BASE = window.__API_BASE__ || 'https://rifa-backend-xvti.onrender.com';
const RAFFLE_PRICE = 2000;
const RAFFLE_SIZE = 100;

const state = {
  numbers: [],
  selected: new Set(),
};

const elements = {
  grid: document.getElementById('numbersGrid'),
  selectedNumbers: document.getElementById('selectedNumbers'),
  selectedBadges: document.getElementById('selectedBadges'),
  selectedCount: document.getElementById('selectedCount'),
  ticketPrice: document.getElementById('ticketPrice'),
  heroPrice: document.getElementById('heroPrice'),
  heroCount: document.getElementById('heroCount'),
  totalPrice: document.getElementById('totalPrice'),
  refreshBtn: document.getElementById('refreshBtn'),
  manualNumbers: document.getElementById('manualNumbers'),
  applyManualBtn: document.getElementById('applyManualBtn'),
  clearSelectionBtn: document.getElementById('clearSelectionBtn'),
  checkoutForm: document.getElementById('checkoutForm'),
  statusMessage: document.getElementById('statusMessage'),
};

let countdownInterval = null;

function money(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
}

function setStatus(message, type = '') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`.trim();
}

function syncSummary() {
  const selected = Array.from(state.selected).sort((a, b) => a - b);
  elements.selectedNumbers.value = selected.length ? selected.join(', ') : '';
  elements.selectedCount.textContent = `${selected.length} ${selected.length === 1 ? 'número' : 'números'}`;
  elements.totalPrice.textContent = money(selected.length * RAFFLE_PRICE);
  elements.ticketPrice.textContent = money(RAFFLE_PRICE);
  elements.heroPrice.textContent = money(RAFFLE_PRICE);
  elements.heroCount.textContent = String(RAFFLE_SIZE);

  elements.selectedBadges.innerHTML = selected
    .map((number) => `<span class="selected-badge">#${number}</span>`)
    .join('');

  if (!selected.length) {
    setStatus('Selecciona uno o más números para continuar.');
  }
}

function renderGrid() {
  elements.grid.innerHTML = '';

  state.numbers.forEach((ticket) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = ticket.number;
    button.className = `number-btn ${ticket.status}`;

    if (state.selected.has(ticket.number)) {
      button.classList.add('selected');
    }

    if (ticket.status !== 'available') {
      button.disabled = true;
    }

    button.addEventListener('click', () => toggleNumber(ticket.number));
    elements.grid.appendChild(button);
  });
}

function toggleNumber(number) {
  const ticket = state.numbers.find((item) => item.number === number);
  if (!ticket || ticket.status !== 'available') return;

  if (state.selected.has(number)) {
    state.selected.delete(number);
  } else {
    state.selected.add(number);
  }

  renderGrid();
  syncSummary();
}

function applyManualSelection() {
  const raw = elements.manualNumbers.value.trim();
  if (!raw) return;

  const inputNumbers = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= RAFFLE_SIZE);

  inputNumbers.forEach((number) => {
    const ticket = state.numbers.find((item) => item.number === number);
    if (ticket?.status === 'available') {
      state.selected.add(number);
    }
  });

  renderGrid();
  syncSummary();
  elements.manualNumbers.value = '';
}

async function loadNumbers() {
  try {
    setStatus('Cargando números...');
    const response = await fetch(`${API_BASE}/api/numbers`);
    const result = await response.json();

    if (!response.ok) throw new Error(result.error || 'No fue posible cargar los números.');

    state.numbers = result.numbers || [];
    renderGrid();
    syncSummary();
    setStatus('Ya puedes elegir tus números.', 'success');
  } catch (error) {
    setStatus(error.message || 'Error al cargar los números.', 'error');
  }
}

function startCountdown(reservedUntil) {
  const end = new Date(reservedUntil).getTime();

  clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const diff = end - Date.now();

    if (diff <= 0) {
      clearInterval(countdownInterval);

      state.selected.clear();
      syncSummary();
      loadNumbers();

      setStatus('⛔ Tiempo expirado. Números liberados.', 'error');
      return;
    }

    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);

    setStatus(`⏳ Reserva: ${min}:${sec.toString().padStart(2, '0')}`, 'warning');

  }, 1000);
}

async function handleCheckout(event) {
  event.preventDefault();

  const numbers = Array.from(state.selected).sort((a, b) => a - b);
  const payerName = document.getElementById('name').value.trim();
  const payerPhone = document.getElementById('phone').value.trim();
  const payerEmail = document.getElementById('email').value.trim();
  const payerRut = document.getElementById('payerRut').value.trim();

  if (!numbers.length) {
    setStatus('Debes elegir al menos un número.', 'warning');
    return;
  }

  if (!payerName || !payerPhone || !payerEmail) {
    setStatus('Completa nombre, celular y mail antes de continuar.', 'warning');
    return;
  }

  try {
    setStatus('Generando pago...');

    const response = await fetch(`${API_BASE}/api/payments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numbers,
        payerName,
        payerPhone,
        payerEmail,
        payerRut,
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible iniciar el pago.');

    // 👉 NUEVO: inicia contador
    if (result.reserved_until) {
      startCountdown(result.reserved_until);
    }

    if (!result.payment_url) throw new Error('El backend no devolvió la URL de pago.');

    window.location.href = result.payment_url;

  } catch (error) {
    setStatus(error.message || 'Ocurrió un error al crear el pago.', 'error');
  }
}

function bindEvents() {
  elements.refreshBtn.addEventListener('click', loadNumbers);
  elements.applyManualBtn.addEventListener('click', applyManualSelection);
  elements.clearSelectionBtn.addEventListener('click', () => {
    state.selected.clear();
    renderGrid();
    syncSummary();
  });
  elements.checkoutForm.addEventListener('submit', handleCheckout);
}

// =======================
// PREMIOS DINÁMICOS
// =======================

async function loadPrizes() {
  const container = document.querySelector('.prizes-grid');
  if (!container) return;

  const res = await fetch(`${API_BASE}/api/prizes`);
  const data = await res.json();

  container.innerHTML = (data.prizes || []).map(p => `
    <article class="prize-card">
      <img src="${p.image}">
      <div>
        <h3>${p.title}</h3>
        <p>${p.description}</p>
      </div>
    </article>
  `).join('');
}

function setView(mode) {
  const container = document.querySelector('.prizes-grid');
  if (!container) return;

  container.className = mode === 'list' ? 'prizes-list' : 'prizes-grid';
}

// =======================
// INIT
// =======================

bindEvents();
loadNumbers();
loadPrizes();
syncSummary();
