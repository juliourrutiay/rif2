const API_BASE = window.__API_BASE__ || 'https://rifa-backend-xvti.onrender.com';

const RAFFLE_PRICE = 2000;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 100;

const PURCHASE_STORAGE_KEY = 'rifaPendingOpportunityPurchase';

const state = {
  quantity: 1,
  pendingPaymentUrl: null,
};

const elements = {
  quantityValue: document.getElementById('quantityValue'),
  selectedCount: document.getElementById('selectedCount'),
  ticketPrice: document.getElementById('ticketPrice'),
  heroPrice: document.getElementById('heroPrice'),
  totalPrice: document.getElementById('totalPrice'),
  checkoutTotalPrice: document.getElementById('checkoutTotalPrice'),

  decreaseQuantityBtn: document.getElementById('decreaseQuantityBtn'),
  increaseQuantityBtn: document.getElementById('increaseQuantityBtn'),
  quickQuantityBtns: document.querySelectorAll('.quick-quantity-btn'),

  checkoutForm: document.getElementById('checkoutForm'),
  flowPayBtn: document.getElementById('flowPayBtn'),
  statusMessage: document.getElementById('statusMessage'),

  flowModal: document.getElementById('flowModal'),
  modalQuantity: document.getElementById('modalQuantity'),
  modalTotal: document.getElementById('modalTotal'),
  cancelFlowModalBtn: document.getElementById('cancelFlowModalBtn'),
  confirmFlowModalBtn: document.getElementById('confirmFlowModalBtn'),

  successModal: document.getElementById('successModal'),
  successMessage: document.getElementById('successMessage'),
  newPurchaseBtn: document.getElementById('newPurchaseBtn'),

  cancelModal: document.getElementById('cancelModal'),
  closeCancelModalBtn: document.getElementById('closeCancelModalBtn'),

  floatingCheckoutBtn: document.getElementById('floatingCheckoutBtn'),
};

function money(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function setStatus(message, type = '') {
  if (!elements.statusMessage) return;

  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`.trim();
}

function savePendingPurchase(data) {
  localStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify(data));
}

function getPendingPurchase() {
  try {
    const raw = localStorage.getItem(PURCHASE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingPurchase() {
  localStorage.removeItem(PURCHASE_STORAGE_KEY);
}

function clampQuantity(value) {
  const quantity = Number(value);

  if (!Number.isInteger(quantity)) return MIN_QUANTITY;
  if (quantity < MIN_QUANTITY) return MIN_QUANTITY;
  if (quantity > MAX_QUANTITY) return MAX_QUANTITY;

  return quantity;
}

function quantityText(quantity) {
  return `${quantity} ${quantity === 1 ? 'oportunidad' : 'oportunidades'}`;
}

function syncSummary() {
  const quantity = state.quantity;
  const total = quantity * RAFFLE_PRICE;

  if (elements.quantityValue) {
    elements.quantityValue.textContent = String(quantity);
  }

  if (elements.selectedCount) {
    elements.selectedCount.textContent = quantityText(quantity);
  }

  if (elements.ticketPrice) {
    elements.ticketPrice.textContent = money(RAFFLE_PRICE);
  }

  if (elements.heroPrice) {
    elements.heroPrice.textContent = money(RAFFLE_PRICE);
  }

  if (elements.totalPrice) {
    elements.totalPrice.textContent = money(total);
  }

  if (elements.checkoutTotalPrice) {
    elements.checkoutTotalPrice.textContent = money(total);
  }

  if (elements.modalQuantity) {
    elements.modalQuantity.textContent = quantityText(quantity);
  }

  if (elements.modalTotal) {
    elements.modalTotal.textContent = money(total);
  }

  updateFloatingCheckoutButton();
}

function setQuantity(value) {
  state.quantity = clampQuantity(value);
  syncSummary();
}

function increaseQuantity() {
  setQuantity(state.quantity + 1);
}

function decreaseQuantity() {
  setQuantity(state.quantity - 1);
}

function clearFormFields() {
  const name = document.getElementById('name');
  const phone = document.getElementById('phone');
  const email = document.getElementById('email');

  if (name) name.value = '';
  if (phone) phone.value = '';
  if (email) email.value = '';
}

function setLoading(isLoading) {
  if (!elements.flowPayBtn) return;

  elements.flowPayBtn.disabled = isLoading;
  elements.flowPayBtn.textContent = isLoading ? 'Generando pago...' : 'Pagar con Flow';
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

  const checkoutVisible = isCheckoutVisible();

  if (!checkoutVisible) {
    elements.floatingCheckoutBtn.classList.remove('hidden');
  } else {
    elements.floatingCheckoutBtn.classList.add('hidden');
  }
}

function openFlowModal(paymentUrl) {
  state.pendingPaymentUrl = paymentUrl;
  elements.flowModal.classList.remove('hidden');
}

function closeFlowModal() {
  state.pendingPaymentUrl = null;
  elements.flowModal.classList.add('hidden');
}

function openSuccessModal(quantity) {
  if (elements.successMessage) {
    elements.successMessage.textContent =
      `Tu pago fue recibido correctamente. Compraste ${quantityText(quantity)} para participar en la rifa.`;
  }

  elements.successModal.classList.remove('hidden');
}

function closeSuccessModal() {
  elements.successModal.classList.add('hidden');
}

function openCancelModal() {
  elements.cancelModal.classList.remove('hidden');
}

function closeCancelModal() {
  elements.cancelModal.classList.add('hidden');
}

function cleanUrl() {
  const clean = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, '', clean);
}

function restartPurchaseFlow() {
  clearPendingPurchase();
  closeFlowModal();
  closeSuccessModal();
  closeCancelModal();

  state.pendingPaymentUrl = null;
  state.quantity = 1;

  clearFormFields();
  syncSummary();
  setStatus('Completa tus datos para continuar.');

  cleanUrl();
}

function handleReturnStatus() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');

  if (status === 'success') {
    const pending = getPendingPurchase();
    const quantity = Number(params.get('qty') || pending?.quantity || state.quantity || 1);

    clearPendingPurchase();
    openSuccessModal(quantity);
    setStatus('Compra confirmada correctamente.', 'success');
    cleanUrl();
  }

  if (status === 'cancel' || status === 'error' || status === 'pending') {
    clearPendingPurchase();
    openCancelModal();

    if (status === 'pending') {
      setStatus('El pago quedó pendiente de confirmación. Revisa tu correo o intenta nuevamente.', 'warning');
    } else if (status === 'error') {
      setStatus('No fue posible confirmar el pago. Intenta nuevamente.', 'error');
    } else {
      setStatus('El pago fue cancelado o no finalizado.', 'warning');
    }

    cleanUrl();
  }
}

async function handleFlowCheckout(event) {
  event.preventDefault();

  const payerName = document.getElementById('name').value.trim();
  const payerPhone = document.getElementById('phone').value.trim();
  const payerEmail = document.getElementById('email').value.trim();

  if (!payerName || !payerPhone || !payerEmail) {
    setStatus('Completa nombre, celular y mail antes de continuar.', 'warning');
    return;
  }

  try {
    setLoading(true);
    setStatus('Generando pago con Flow...');

    const response = await fetch(`${API_BASE}/api/flow/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: state.quantity,
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
    } catch {
      console.error('Respuesta no JSON:', rawText);
      throw new Error('El servidor no devolvió una respuesta JSON válida.');
    }

    if (!response.ok) {
      throw new Error(result.error || 'No fue posible iniciar el pago con Flow.');
    }

    if (!result.payment_url) {
      throw new Error('El backend no devolvió la URL de pago.');
    }

    savePendingPurchase({
      quantity: state.quantity,
      amount: state.quantity * RAFFLE_PRICE,
      transactionId: result.transaction_id || null,
    });

    openFlowModal(result.payment_url);
    setStatus('Confirma para continuar a Flow.', 'success');
  } catch (error) {
    setStatus(error.message || 'Ocurrió un error al crear el pago.', 'error');
  } finally {
    setLoading(false);
  }
}

async function loadPrizes() {
  const container = document.querySelector('.prizes-grid');
  if (!container) return;

  try {
    container.innerHTML = '';

    const response = await fetch(`${API_BASE}/api/prizes`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'No fue posible cargar los premios.');
    }

    const prizes = data.prizes || [];

    if (!prizes.length) {
      container.innerHTML = `
        <article class="prize-card">
          <div>
            <h3>Premios por confirmar</h3>
            <p>Pronto se publicarán los premios oficiales de esta rifa solidaria.</p>
          </div>
        </article>
      `;
      return;
    }

    container.innerHTML = prizes
      .map(
        (p) => `
          <article class="prize-card">
            <img src="${p.image}" alt="${p.title}">
            <div>
              <h3>${p.title}</h3>
              <p>${p.description}</p>
            </div>
          </article>
        `
      )
      .join('');
  } catch (error) {
    console.error('Error cargando premios:', error);
  }
}

function bindEvents() {
  if (elements.decreaseQuantityBtn) {
    elements.decreaseQuantityBtn.addEventListener('click', decreaseQuantity);
  }

  if (elements.increaseQuantityBtn) {
    elements.increaseQuantityBtn.addEventListener('click', increaseQuantity);
  }

  elements.quickQuantityBtns.forEach((button) => {
    button.addEventListener('click', () => {
      setQuantity(Number(button.dataset.quantity));
    });
  });

  if (elements.checkoutForm) {
    elements.checkoutForm.addEventListener('submit', handleFlowCheckout);
  }

  if (elements.cancelFlowModalBtn) {
    elements.cancelFlowModalBtn.addEventListener('click', closeFlowModal);
  }

  if (elements.confirmFlowModalBtn) {
    elements.confirmFlowModalBtn.addEventListener('click', () => {
      if (!state.pendingPaymentUrl) return;

      const paymentUrl = state.pendingPaymentUrl;
      closeFlowModal();
      window.location.href = paymentUrl;
    });
  }

  if (elements.flowModal) {
    elements.flowModal.addEventListener('click', (event) => {
      if (event.target === elements.flowModal) {
        closeFlowModal();
      }
    });
  }

  if (elements.newPurchaseBtn) {
    elements.newPurchaseBtn.addEventListener('click', restartPurchaseFlow);
  }

  if (elements.closeCancelModalBtn) {
    elements.closeCancelModalBtn.addEventListener('click', () => {
      closeCancelModal();
      cleanUrl();
    });
  }

  if (elements.cancelModal) {
    elements.cancelModal.addEventListener('click', (event) => {
      if (event.target === elements.cancelModal) {
        closeCancelModal();
      }
    });
  }

  if (elements.successModal) {
    elements.successModal.addEventListener('click', (event) => {
      if (event.target === elements.successModal) {
        closeSuccessModal();
      }
    });
  }

if (elements.floatingCheckoutBtn) {

  elements.floatingCheckoutBtn.addEventListener('click', () => {

    const participar = document.getElementById('participar');

    if (!participar) return;

    participar.scrollIntoView({ behavior: 'smooth', block: 'start' });

  });

}

  window.addEventListener('scroll', updateFloatingCheckoutButton);
  window.addEventListener('resize', updateFloatingCheckoutButton);
}

bindEvents();
loadPrizes();
handleReturnStatus();
syncSummary();
