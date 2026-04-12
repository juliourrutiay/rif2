const API_BASE = window.__API_BASE__ || 'https://rifa-backend-xvti.onrender.com';
const RAFFLE_PRICE = 2000;
const RAFFLE_SIZE = 500;

const state = {
  numbers: [],
  selected: new Set(),
  pendingPaymentUrl: null,
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
  clearSelectionBtn: document.getElementById('clearSelectionBtn'),
  checkoutForm: document.getElementById('checkoutForm'),
  statusMessage: document.getElementById('statusMessage'),
  paymentModal: document.getElementById('paymentModal'),
  confirmPaymentModalBtn: document.getElementById('confirmPaymentModalBtn'),
  cancelPaymentModalBtn: document.getElementById('cancelPaymentModalBtn'),
};

let countdownInterval = null;

function money(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function setStatus(message, type = '') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`.trim();
}

function syncSummary() {
  const selected = Array.from(state.selected).sort((a, b) => a - b);
  const availableCount = state.numbers.filter((ticket) => ticket.status === 'available').length;

  elements.selectedNumbers.value = selected.length ? selected.join(', ') : '';
  elements.selectedCount.textContent = `${selected.length} ${selected.length === 1 ? 'número' : 'números'}`;
  elements.totalPrice.textContent = money(selected.length * RAFFLE_PRICE);
  elements.ticketPrice.textContent = money(RAFFLE_PRICE);
  elements.heroPrice.textContent = money(RAFFLE_PRICE);
  elements.heroCount.textContent = String(availableCount);

  elements.selectedBadges.innerHTML = selected
    .map((number) => `<span class="selected-badge">#${number}</span>`)
    .join('');

  if (elements.clearSelectionBtn) {
    elements.clearSelectionBtn.style.display = selected.length ? 'inline-flex' : 'none';
  }

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

async function loadNumbers() {
  try {
    setStatus('Cargando números...');
    const response = await fetch(`${API_BASE}/api/numbers`);
    const result = await response.json();

    if (!response.ok) {
      const detailText = result?.details
        ? ` Detalle: ${JSON.stringify(result.details)}`
        : '';

      throw new Error((result.error || 'No fue posible cargar los números.') + detailText);
    }

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
      document.getElementById('name').value = '';
      document.getElementById('phone').value = '';
      document.getElementById('email').value = '';
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

function openPaymentModal(paymentUrl) {
  state.pendingPaymentUrl = paymentUrl;
  elements.paymentModal.classList.remove('hidden');
}

function closePaymentModal() {
  state.pendingPaymentUrl = null;
  elements.paymentModal.classList.add('hidden');
}

function handleReturnStatus() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');

  if (status === 'cancel') {
    setStatus(
      'Pago cancelado. Tus números seguirán bloqueados hasta completar los 10 minutos de reserva y luego volverán a estar disponibles.',
      'warning'
    );
  }

  if (status === 'success') {
    setStatus(
      'Volviste desde Khipu. Estamos validando tu pago y actualizando tus números.',
      'success'
    );
    loadNumbers();
  }
}

async function handleCheckout(event) {
  event.preventDefault();

  const numbers = Array.from(state.selected).sort((a, b) => a - b);
  const payerName = document.getElementById('name').value.trim();
  const payerPhone = document.getElementById('phone').value.trim();
  const payerEmail = document.getElementById('email').value.trim();

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
        payerRut: '',
      }),
    });

    const rawText = await response.text();
    let result = {};

    try {
      result = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      console.error('Respuesta no JSON:', rawText);
      throw new Error('El servidor no devolvió una respuesta JSON válida.');
    }

    if (!response.ok) {
      const detailText = result?.details
        ? ` Detalle: ${JSON.stringify(result.details)}`
        : '';

      throw new Error((result.error || 'No fue posible iniciar el pago.') + detailText);
    }

    if (result.reserved_until) {
      startCountdown(result.reserved_until);
    }

    if (!result.payment_url) {
      throw new Error('El backend no devolvió la URL de pago.');
    }

    openPaymentModal(result.payment_url);
  } catch (error) {
    setStatus(error.message || 'Ocurrió un error al crear el pago.', 'error');
  }
}

async function loadPrizes() {
  const container = document.querySelector('.prizes-grid');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/api/prizes`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'No fue posible cargar los premios.');

    const prizes = data.prizes || [];

    if (!prizes.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = prizes.map((p) => `
      <article class="prize-card">
        <img src="${p.image}" alt="${p.title}">
        <div>
          <h3>${p.title}</h3>
          <p>${p.description}</p>
        </div>
      </article>
    `).join('');
  } catch (error) {
    console.error('Error cargando premios:', error);
  }
}

function bindEvents() {
  elements.refreshBtn.addEventListener('click', loadNumbers);

  elements.clearSelectionBtn.addEventListener('click', () => {
    state.selected.clear();
    renderGrid();
    syncSummary();
  });

  elements.checkoutForm.addEventListener('submit', handleCheckout);

  elements.cancelPaymentModalBtn.addEventListener('click', () => {
    closePaymentModal();
    setStatus(
      'Pago cancelado antes de abrir Khipu. Los números seguirán reservados hasta completar los 10 minutos.',
      'warning'
    );
  });

  elements.confirmPaymentModalBtn.addEventListener('click', () => {
    if (!state.pendingPaymentUrl) return;
    const paymentUrl = state.pendingPaymentUrl;
    closePaymentModal();
    window.location.href = paymentUrl;
  });

  elements.paymentModal.addEventListener('click', (event) => {
    if (event.target === elements.paymentModal) {
      closePaymentModal();
      setStatus(
        'Pago cancelado antes de abrir Khipu. Los números seguirán reservados hasta completar los 10 minutos.',
        'warning'
      );
    }
  });
}

bindEvents();
loadNumbers();
loadPrizes();
handleReturnStatus();
syncSummary();
