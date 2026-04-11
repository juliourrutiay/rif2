const API_BASE = window.__API_BASE__ || 'https://rifa-backend-xvti.onrender.com';

const elements = {
  adminToken: document.getElementById('adminToken'),
  loadAdminBtn: document.getElementById('loadAdminBtn'),
  downloadCsvLink: document.getElementById('downloadCsvLink'),
  adminTableBody: document.getElementById('adminTableBody'),
  adminStatus: document.getElementById('adminStatus'),
  metricTotal: document.getElementById('metricTotal'),
  metricPaid: document.getElementById('metricPaid'),
  metricReserved: document.getElementById('metricReserved'),
  metricAvailable: document.getElementById('metricAvailable'),

  prizeTitle: document.getElementById('prizeTitle'),
  prizeDesc: document.getElementById('prizeDesc'),
  prizeImg: document.getElementById('prizeImg'),
  addPrizeBtn: document.getElementById('addPrizeBtn'),
  prizeList: document.getElementById('prizeList'),

  editNumber: document.getElementById('editNumber'),
  editStatus: document.getElementById('editStatus'),
  editPayerName: document.getElementById('editPayerName'),
  editPayerPhone: document.getElementById('editPayerPhone'),
  editPayerEmail: document.getElementById('editPayerEmail'),
  editPayerRut: document.getElementById('editPayerRut'),
  editPaymentChannel: document.getElementById('editPaymentChannel'),
  editPaymentId: document.getElementById('editPaymentId'),
  editTransactionId: document.getElementById('editTransactionId'),
  editReservedUntil: document.getElementById('editReservedUntil'),
  editNotes: document.getElementById('editNotes'),
  saveTicketBtn: document.getElementById('saveTicketBtn'),
  clearTicketFormBtn: document.getElementById('clearTicketFormBtn'),
};

let editingPrizeId = null;
let currentTickets = [];

function getToken() {
  return elements.adminToken.value.trim();
}

function setStatus(message, type = '') {
  elements.adminStatus.textContent = message;
  elements.adminStatus.className = `status-message ${type}`.trim();
}

function clearTicketForm() {
  elements.editNumber.value = '';
  elements.editStatus.value = 'available';
  elements.editPayerName.value = '';
  elements.editPayerPhone.value = '';
  elements.editPayerEmail.value = '';
  elements.editPayerRut.value = '';
  elements.editPaymentChannel.value = '';
  elements.editPaymentId.value = '';
  elements.editTransactionId.value = '';
  elements.editReservedUntil.value = '';
  elements.editNotes.value = '';
}

function fillTicketForm(ticket) {
  elements.editNumber.value = ticket.number ?? '';
  elements.editStatus.value = ticket.status ?? 'available';
  elements.editPayerName.value = ticket.payer_name ?? '';
  elements.editPayerPhone.value = ticket.payer_phone ?? '';
  elements.editPayerEmail.value = ticket.payer_email ?? '';
  elements.editPayerRut.value = ticket.payer_rut ?? '';
  elements.editPaymentChannel.value = ticket.payment_channel ?? '';
  elements.editPaymentId.value = ticket.payment_id ?? '';
  elements.editTransactionId.value = ticket.transaction_id ?? '';
  elements.editReservedUntil.value = ticket.reserved_until ?? '';
  elements.editNotes.value = ticket.notes ?? '';

  setStatus(`Editando número ${ticket.number}.`, 'warning');
}

async function saveTicketChanges() {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  const number = Number(elements.editNumber.value);
  if (!Number.isInteger(number) || number <= 0) {
    setStatus('Debes indicar un número válido.', 'warning');
    return;
  }

  const data = {
    status: elements.editStatus.value,
    payer_name: elements.editPayerName.value.trim() || null,
    payer_phone: elements.editPayerPhone.value.trim() || null,
    payer_email: elements.editPayerEmail.value.trim() || null,
    payer_rut: elements.editPayerRut.value.trim() || null,
    payment_channel: elements.editPaymentChannel.value.trim() || null,
    payment_id: elements.editPaymentId.value.trim() || null,
    transaction_id: elements.editTransactionId.value.trim() || null,
    reserved_until: elements.editReservedUntil.value.trim() || null,
    notes: elements.editNotes.value.trim() || null,
  };

  try {
    const response = await fetch(`${API_BASE}/api/admin/update-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify({ number, data }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible guardar cambios.');

    await loadAdminData();
    setStatus(`Número ${number} actualizado correctamente.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Error al guardar cambios del número.', 'error');
  }
}

async function releaseNumber(number) {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/release-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify({ number }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible liberar el número.');

    await loadAdminData();
    setStatus(`Número ${number} liberado correctamente.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Error al liberar número.', 'error');
  }
}

async function markAsPaid(number) {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  const ticket = currentTickets.find((row) => row.number === number);

  try {
    const response = await fetch(`${API_BASE}/api/admin/update-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify({
        number,
        data: {
          status: 'paid',
          payment_channel: ticket?.payment_channel || 'manual',
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible actualizar el número.');

    await loadAdminData();
    setStatus(`Número ${number} actualizado a pagado.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Error al actualizar número.', 'error');
  }
}

function renderRows(rows) {
  currentTickets = rows;

  elements.adminTableBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${row.number ?? ''}</td>
        <td>${row.status ?? ''}</td>
        <td>${row.payer_name ?? ''}</td>
        <td>${row.payer_phone ?? ''}</td>
        <td>${row.payer_email ?? ''}</td>
        <td>${row.payment_channel ?? ''}</td>
        <td>
          <button type="button" onclick="editTicket(${row.number})">Editar</button>
          <button type="button" onclick="releaseNumber(${row.number})">Liberar</button>
          <button type="button" onclick="markAsPaid(${row.number})">Pagado</button>
        </td>
      </tr>
    `)
    .join('');

  const total = rows.length;
  const paid = rows.filter((row) => row.status === 'paid').length;
  const reserved = rows.filter((row) => row.status === 'reserved').length;
  const available = rows.filter((row) => row.status === 'available').length;

  elements.metricTotal.textContent = total;
  elements.metricPaid.textContent = paid;
  elements.metricReserved.textContent = reserved;
  elements.metricAvailable.textContent = available;
}

function editTicket(number) {
  const ticket = currentTickets.find((row) => row.number === number);
  if (!ticket) return;
  fillTicketForm(ticket);
}

async function loadAdminData() {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  try {
    setStatus('Cargando panel...');

    const response = await fetch(`${API_BASE}/api/admin/tickets`, {
      headers: { 'x-admin-token': token },
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible cargar el panel.');

    renderRows(result.tickets || []);
    elements.downloadCsvLink.href = `${API_BASE}/api/admin/export.csv?token=${encodeURIComponent(token)}`;

    await loadPrizesAdmin();

    setStatus('Panel cargado correctamente.', 'success');
  } catch (error) {
    setStatus(error.message || 'Error al cargar el panel.', 'error');
  }
}

function fillPrizeForm(prize) {
  elements.prizeTitle.value = prize.title || '';
  elements.prizeDesc.value = prize.description || '';
  elements.prizeImg.value = prize.image || '';
  editingPrizeId = prize.id;
  elements.addPrizeBtn.textContent = 'Guardar cambios';
}

function resetPrizeForm() {
  elements.prizeTitle.value = '';
  elements.prizeDesc.value = '';
  elements.prizeImg.value = '';
  editingPrizeId = null;
  elements.addPrizeBtn.textContent = 'Agregar premio';
}

function renderPrizeList(prizes) {
  if (!elements.prizeList) return;

  if (!prizes.length) {
    elements.prizeList.innerHTML = '<p class="status-message">No hay premios cargados.</p>';
    return;
  }

  elements.prizeList.innerHTML = prizes.map((p) => `
    <div style="margin-bottom:12px; padding:12px; border:1px solid rgba(255,255,255,0.08); border-radius:12px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <img src="${p.image}" alt="${p.title}" style="width:80px; height:80px; object-fit:cover; border-radius:10px;" />
        <div style="flex:1; min-width:220px;">
          <strong>${p.title}</strong>
          <div>${p.description}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" onclick="editPrize(${JSON.stringify(p).replace(/"/g, '&quot;')})">Editar</button>
          <button type="button" onclick="deletePrize(${p.id})">Eliminar</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadPrizesAdmin() {
  const token = getToken();
  if (!token) {
    if (elements.prizeList) {
      elements.prizeList.innerHTML = '<p class="status-message">Ingresa el token para administrar premios.</p>';
    }
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/prizes`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'No fue posible cargar premios.');

    renderPrizeList(data.prizes || []);
  } catch (error) {
    setStatus(error.message || 'Error al cargar premios.', 'error');
  }
}

async function savePrize() {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  const title = elements.prizeTitle.value.trim();
  const description = elements.prizeDesc.value.trim();
  const image = elements.prizeImg.value.trim();

  if (!title || !description || !image) {
    setStatus('Completa título, descripción e imagen del premio.', 'warning');
    return;
  }

  try {
    let response;

    if (editingPrizeId) {
      response = await fetch(`${API_BASE}/api/admin/prizes/${editingPrizeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({ title, description, image }),
      });
    } else {
      response = await fetch(`${API_BASE}/api/admin/prizes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({ title, description, image }),
      });
    }

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible guardar el premio.');

    resetPrizeForm();
    await loadPrizesAdmin();
    setStatus('Premio guardado correctamente.', 'success');
  } catch (error) {
    setStatus(error.message || 'Error al guardar premio.', 'error');
  }
}

async function deletePrize(id) {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/prizes/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': token },
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible eliminar el premio.');

    if (editingPrizeId === id) {
      resetPrizeForm();
    }

    await loadPrizesAdmin();
    setStatus('Premio eliminado correctamente.', 'success');
  } catch (error) {
    setStatus(error.message || 'Error al eliminar premio.', 'error');
  }
}

function editPrize(prize) {
  fillPrizeForm(prize);
  setStatus(`Editando premio: ${prize.title}`, 'warning');
}

elements.loadAdminBtn.addEventListener('click', loadAdminData);
elements.saveTicketBtn.addEventListener('click', saveTicketChanges);
elements.clearTicketFormBtn.addEventListener('click', clearTicketForm);

if (elements.addPrizeBtn) {
  elements.addPrizeBtn.addEventListener('click', savePrize);
}

window.releaseNumber = releaseNumber;
window.markAsPaid = markAsPaid;
window.deletePrize = deletePrize;
window.editPrize = editPrize;
window.editTicket = editTicket;
