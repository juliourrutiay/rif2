const API_BASE = window.__API_BASE__ || 'https://rifa-backend-xvti.onrender.com';
const RAFFLE_PRICE = 2000;
const RAFFLE_SIZE = 500;
const PAYMENT_STORAGE_KEY = 'rifaPendingPayment';
const TRANSFER_STORAGE_KEY = 'rifaPendingTransfer';

const TRANSFER_COPY_VALUE = [
  'Julio URRUTIA',
  '17.090.849-K',
  'urrutia.julio@icloud.com',
  'Cuenta Corriente',
  '17200038940',
  'Banco Falabella',
].join('\n');

const state = {
  numbers: [],
  selected: new Set(),
  pendingPaymentUrl: null,
  paymentBlockedUntil: null,
  activeFlow: null, // 'khipu' | 'transfer' | null
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
  payBtn: document.getElementById('payBtn'),
  transferReserveBtn: document.getElementById('transferReserveBtn'),
  restartPurchaseInlineBtn: document.getElementById('restartPurchaseInlineBtn'),
  floatingCheckoutBtn: document.getElementById('floatingCheckoutBtn'),

  paymentModal: document.getElementById('paymentModal'),
  confirmPaymentModalBtn: document.getElementById('confirmPaymentModalBtn'),
  cancelPaymentModalBtn: document.getElementById('cancelPaymentModalBtn'),

  cancelledFlowModal: document.getElementById('cancelledFlowModal'),
  cancelledFlowCountdown: document.getElementById('cancelledFlowCountdown'),
  closeCancelledFlowModalBtn: document.getElementById('closeCancelledFlowModalBtn'),
  restartPurchaseBtn: document.getElementById('restartPurchaseBtn'),

  transferModal: document.getElementById('transferModal'),
  transferCountdown: document.getElementById('transferCountdown'),
  transferReservedNumbers: document.getElementById('transferReservedNumbers'),
  copyTransferDataBtn: document.getElementById('copyTransferDataBtn'),
  closeTransferModalBtn: document.getElementById('closeTransferModalBtn'),
};

let countdownInterval = null;
let blockedCountdownInterval = null;
let transferDisplayCountdownInterval = null;

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

function formatCountdown(diffMs) {
  const min = Math.floor(diffMs / 60000);
  const sec = Math.floor((diffMs % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function savePendingPayment(data) {
  localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(data));
}

function getPendingPayment() {
  try {
    const raw = localStorage.getItem(PAYMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingPayment() {
  localStorage.removeItem(PAYMENT_STORAGE_KEY);
}

function savePendingTransfer(data) {
  localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(data));
}

function getPendingTransfer() {
  try {
    const raw = localStorage.getItem(TRANSFER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingTransfer() {
  localStorage.removeItem(TRANSFER_STORAGE_KEY);
}

function isCheckoutVisible() {
  const checkout = document.getElementById('checkout');
  if (!checkout) return false;

  const rect = checkout.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  return rect.top < viewportHeight * 0.85 && rect.bottom > 80;
}

function updateFloatingCheckoutButton() {
  if (!elements.floatingCheckoutBtn) return;

  const hasSelection = state.selected.size > 0;
  const checkoutVisible = isCheckoutVisible();
  const blocked = !!state.paymentBlockedUntil;

  if (hasSelection && !checkoutVisible && !blocked) {
    elements.floatingCheckoutBtn.classList.remove('hidden');
  } else {
    elements.floatingCheckoutBtn.classList.add('hidden');
  }
}

function setCheckoutBlockedState(payText = 'Pago temporalmente bloqueado', transferText = 'Reserva temporalmente bloqueada') {
  if (elements.payBtn) {
    elements.payBtn.disabled = true;
    elements.payBtn.textContent = payText;
  }

  if (elements.transferReserveBtn) {
    elements.transferReserveBtn.disabled = false;
    elements.transferReserveBtn.textContent = transferText;
  }

  if (elements.restartPurchaseInlineBtn) {
    elements.restartPurchaseInlineBtn.style.display = 'inline-flex';
  }

  updateFloatingCheckoutButton();
}

function resetCheckoutActions() {
  if (elements.payBtn) {
    elements.payBtn.disabled = false;
    elements.payBtn.textContent = 'Pagar con Khipu';
  }

  if (elements.transferReserveBtn) {
    elements.transferReserveBtn.disabled = false;
    elements.transferReserveBtn.textContent = 'Reservar y transferir';
  }

  if (elements.restartPurchaseInlineBtn) {
    elements.restartPurchaseInlineBtn.style.display = 'none';
  }

  updateFloatingCheckoutButton();
}

function clearFormFields() {
  document.getElementById('name').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('email').value = '';
}

function isSelectionBlocked() {
  return !!state.paymentBlockedUntil;
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

  updateFloatingCheckoutButton();
}

function renderGrid() {
  elements.grid.innerHTML = '';
  const selectionBlocked = isSelectionBlocked();

  state.numbers.forEach((ticket) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = ticket.number;
    button.className = `number-btn ${ticket.status}`;

    if (state.selected.has(ticket.number)) {
      button.classList.add('selected');
    }

    if (ticket.status !== 'available' || selectionBlocked) {
      button.disabled = true;
    }

    button.addEventListener('click', () => toggleNumber(ticket.number));
    elements.grid.appendChild(button);
  });
}

function toggleNumber(number) {
  if (isSelectionBlocked()) {
    if (state.activeFlow === 'transfer') {
      setStatus('Tienes una transferencia en curso. Reinicia la compra si deseas seleccionar otros números.', 'warning');
    } else if (state.activeFlow === 'khipu') {
      setStatus('Tienes un pago en curso. Reinicia la compra si deseas seleccionar otros números.', 'warning');
    } else {
      setStatus('Hay un proceso activo. Reinicia la compra para volver a seleccionar números.', 'warning');
    }
    return;
  }

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

function stopReservationCountdown() {
  clearInterval(countdownInterval);
  countdownInterval = null;
}

function stopBlockedCountdown() {
  clearInterval(blockedCountdownInterval);
  blockedCountdownInterval = null;
}

function stopTransferDisplayCountdown() {
  clearInterval(transferDisplayCountdownInterval);
  transferDisplayCountdownInterval = null;
}

function startReservationCountdown(reservedUntil) {
  const end = new Date(reservedUntil).getTime();

  stopReservationCountdown();

  countdownInterval = setInterval(() => {
    const diff = end - Date.now();

    if (diff <= 0) {
      stopReservationCountdown();
      clearPendingPayment();
      clearPendingTransfer();
      window.location.reload();
      return;
    }

    setStatus(`⏳ Reserva: ${formatCountdown(diff)}`, 'warning');
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

function openCancelledFlowModal() {
  elements.cancelledFlowModal.classList.remove('hidden');
}

function closeCancelledFlowModal() {
  elements.cancelledFlowModal.classList.add('hidden');
}

function openTransferModal() {
  elements.transferModal.classList.remove('hidden');
}

function closeTransferModal() {
  elements.transferModal.classList.add('hidden');
}

function startBlockedPaymentCountdown(reservedUntil) {
  const end = new Date(reservedUntil).getTime();
  state.paymentBlockedUntil = reservedUntil;
  state.activeFlow = 'khipu';

  setCheckoutBlockedState('Pago temporalmente bloqueado', 'Reserva temporalmente bloqueada');
  openCancelledFlowModal();
  renderGrid();
  syncSummary();

  stopBlockedCountdown();

  blockedCountdownInterval = setInterval(() => {
    const diff = end - Date.now();

    if (diff <= 0) {
      stopBlockedCountdown();
      clearPendingPayment();
      closeCancelledFlowModal();
      window.location.reload();
      return;
    }

    const timeText = formatCountdown(diff);
    elements.cancelledFlowCountdown.textContent = timeText;
    setStatus(`⏳ Pago bloqueado temporalmente. Tiempo restante: ${timeText}`, 'warning');
  }, 1000);
}

function startTransferFlow({ reservedUntil, displayUntil, numbers }) {
  state.paymentBlockedUntil = reservedUntil;
  state.activeFlow = 'transfer';

  setCheckoutBlockedState('Reserva activa', 'Transferencia en curso');

  if (elements.transferReservedNumbers) {
    elements.transferReservedNumbers.textContent = numbers.join(', ');
  }

  openTransferModal();
  startReservationCountdown(reservedUntil);
  startTransferDisplayCountdown(displayUntil);
  renderGrid();
  syncSummary();
}

function startTransferDisplayCountdown(displayUntil) {
  const end = new Date(displayUntil).getTime();

  stopTransferDisplayCountdown();

  transferDisplayCountdownInterval = setInterval(() => {
    const diff = end - Date.now();

    if (diff <= 0) {
      stopTransferDisplayCountdown();
      closeTransferModal();
      setStatus('⛔ Tiempo para enviar comprobante finalizado. La página se actualizará.', 'warning');
      window.location.reload();
      return;
    }

    const timeText = formatCountdown(diff);

    if (elements.transferCountdown) {
      elements.transferCountdown.textContent = timeText;
    }

    setStatus(`⏳ Transferencia en curso. Tiempo visible restante: ${timeText}`, 'warning');
  }, 1000);
}

function handleReturnStatus() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  const pendingPayment = getPendingPayment();

  if (status === 'cancel' && pendingPayment?.reservedUntil) {
    startBlockedPaymentCountdown(pendingPayment.reservedUntil);
    startReservationCountdown(pendingPayment.reservedUntil);
  }

  if (status === 'success') {
    clearPendingPayment();
    resetCheckoutActions();
    state.paymentBlockedUntil = null;
    state.activeFlow = null;
    renderGrid();
    syncSummary();
    setStatus(
      'Volviste desde Khipu. Estamos validando tu pago y actualizando tus números.',
      'success'
    );
    loadNumbers();
  }
}

function restorePendingTransfer() {
  const pendingTransfer = getPendingTransfer();
  if (!pendingTransfer?.reservedUntil || !pendingTransfer?.displayUntil || !pendingTransfer?.numbers?.length) return;

  const displayDiff = new Date(pendingTransfer.displayUntil).getTime() - Date.now();
  const reservedDiff = new Date(pendingTransfer.reservedUntil).getTime() - Date.now();

  if (reservedDiff <= 0) {
    clearPendingTransfer();
    return;
  }

  if (displayDiff <= 0) {
    clearPendingTransfer();
    return;
  }

  startTransferFlow({
    reservedUntil: pendingTransfer.reservedUntil,
    displayUntil: pendingTransfer.displayUntil,
    numbers: pendingTransfer.numbers,
  });
}

function restartPurchaseFlow() {
  stopReservationCountdown();
  stopBlockedCountdown();
  stopTransferDisplayCountdown();
  clearPendingPayment();
  clearPendingTransfer();
  closeCancelledFlowModal();
  closePaymentModal();
  closeTransferModal();

  state.pendingPaymentUrl = null;
  state.paymentBlockedUntil = null;
  state.activeFlow = null;
  state.selected.clear();

  clearFormFields();
  resetCheckoutActions();
  renderGrid();
  syncSummary();
  loadNumbers();

  setStatus('Ya puedes seleccionar otros números e iniciar un nuevo proceso.', 'success');
}

function hardResetPurchaseView() {
  stopReservationCountdown();
  stopBlockedCountdown();
  stopTransferDisplayCountdown();
  clearPendingPayment();
  clearPendingTransfer();
  closeCancelledFlowModal();
  closePaymentModal();
  closeTransferModal();

  state.pendingPaymentUrl = null;
  state.paymentBlockedUntil = null;
  state.activeFlow = null;
  state.selected.clear();

  clearFormFields();
  resetCheckoutActions();

  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.location.href = cleanUrl;
}

async function handleCheckout(event) {
  event.preventDefault();

  if (state.paymentBlockedUntil) {
    setStatus('Hay un proceso activo. Reinicia la compra si deseas comenzar uno nuevo.', 'warning');
    return;
  }

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
    setStatus('Generando pago con Khipu...');

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
      startReservationCountdown(result.reserved_until);

      savePendingPayment({
        numbers,
        reservedUntil: result.reserved_until,
        paymentUrl: result.payment_url,
      });
    }

    if (!result.payment_url) {
      throw new Error('El backend no devolvió la URL de pago.');
    }

    openPaymentModal(result.payment_url);
  } catch (error) {
    setStatus(error.message || 'Ocurrió un error al crear el pago.', 'error');
  }
}

async function handleTransferReservation() {
  if (state.paymentBlockedUntil && state.activeFlow === 'transfer') {
    openTransferModal();
    setStatus('Transferencia en curso. Revisa nuevamente los datos y el tiempo restante.', 'warning');
    return;
  }

  if (state.paymentBlockedUntil) {
    setStatus('Hay un proceso activo. Reinicia la compra si deseas comenzar uno nuevo.', 'warning');
    return;
  }

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
    setStatus('Reservando números para transferencia...');

    const response = await fetch(`${API_BASE}/api/transfers/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numbers,
        payerName,
        payerPhone,
        payerEmail,
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

      throw new Error((result.error || 'No fue posible reservar para transferencia.') + detailText);
    }

    const reservedUntil = result.reserved_until;
    const displayMinutes = Number(result.display_countdown_minutes || 30);
    const displayUntil = new Date(Date.now() + displayMinutes * 60000).toISOString();

    if (!reservedUntil) {
      throw new Error('El backend no devolvió el tiempo de reserva.');
    }

    savePendingTransfer({
      numbers,
      reservedUntil,
      displayUntil,
    });

    startTransferFlow({
      reservedUntil,
      displayUntil,
      numbers,
    });

    setStatus('Números reservados. Completa la transferencia y envía el comprobante.', 'success');
  } catch (error) {
    setStatus(error.message || 'Ocurrió un error al reservar para transferencia.', 'error');
  }
}

async function copyTransferData() {
  try {
    await navigator.clipboard.writeText(TRANSFER_COPY_VALUE);
    setStatus('Datos de transferencia copiados correctamente.', 'success');
  } catch (error) {
    const textArea = document.createElement('textarea');
    textArea.value = TRANSFER_COPY_VALUE;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    setStatus('Datos de transferencia copiados correctamente.', 'success');
  }
}

async function loadPrizes() {
  const container = document.querySelector('.prizes-grid');
  if (!container) return;

  try {
    container.innerHTML = '';

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

  if (elements.transferReserveBtn) {
    elements.transferReserveBtn.addEventListener('click', handleTransferReservation);
  }

  elements.cancelPaymentModalBtn.addEventListener('click', () => {
    hardResetPurchaseView();
  });

  elements.confirmPaymentModalBtn.addEventListener('click', () => {
    if (!state.pendingPaymentUrl) return;
    const paymentUrl = state.pendingPaymentUrl;
    closePaymentModal();
    window.location.href = paymentUrl;
  });

  elements.paymentModal.addEventListener('click', (event) => {
    if (event.target === elements.paymentModal) {
      hardResetPurchaseView();
    }
  });

  elements.closeCancelledFlowModalBtn.addEventListener('click', () => {
    closeCancelledFlowModal();
  });

  elements.restartPurchaseBtn.addEventListener('click', restartPurchaseFlow);

  if (elements.restartPurchaseInlineBtn) {
    elements.restartPurchaseInlineBtn.addEventListener('click', restartPurchaseFlow);
  }

  if (elements.copyTransferDataBtn) {
    elements.copyTransferDataBtn.addEventListener('click', copyTransferData);
  }

  if (elements.closeTransferModalBtn) {
    elements.closeTransferModalBtn.addEventListener('click', () => {
      closeTransferModal();
    });
  }

  if (elements.transferModal) {
    elements.transferModal.addEventListener('click', (event) => {
      if (event.target === elements.transferModal) {
        closeTransferModal();
      }
    });
  }

  if (elements.floatingCheckoutBtn) {
    elements.floatingCheckoutBtn.addEventListener('click', () => {
      const checkout = document.getElementById('checkout');
      if (!checkout) return;

      checkout.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  window.addEventListener('scroll', updateFloatingCheckoutButton);
  window.addEventListener('resize', updateFloatingCheckoutButton);

  elements.cancelledFlowModal.addEventListener('click', (event) => {
    if (event.target === elements.cancelledFlowModal) {
      closeCancelledFlowModal();
    }
  });
}

bindEvents();
loadNumbers();
loadPrizes();
handleReturnStatus();
restorePendingTransfer();
syncSummary();
