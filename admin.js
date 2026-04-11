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

  selectAllBtn: document.getElementById('selectAllBtn'),
  clearSelectedBtn: document.getElementById('clearSelectedBtn'),
  bulkEditBtn: document.getElementById('bulkEditBtn'),
  bulkReleaseBtn: document.getElementById('bulkReleaseBtn'),
  bulkEditor: document.getElementById('bulkEditor'),
  bulkStatus: document.getElementById('bulkStatus'),
  bulkPayerName: document.getElementById('bulkPayerName'),
  bulkPayerPhone: document.getElementById('bulkPayerPhone'),
  bulkPayerEmail: document.getElementById('bulkPayerEmail'),
  bulkPayerRut: document.getElementById('bulkPayerRut'),
  bulkPaymentChannel: document.getElementById('bulkPaymentChannel'),
  bulkNotes: document.getElementById('bulkNotes'),
  applyBulkBtn: document.getElementById('applyBulkBtn'),

  prizeTitle: document.getElementById('prizeTitle'),
  prizeDesc: document.getElementById('prizeDesc'),
  prizeImg: document.getElementById('prizeImg'),
  addPrizeBtn: document.getElementById('addPrizeBtn'),
  prizeList: document.getElementById('prizeList'),
};

let editingPrizeId = null;
let currentTickets = [];
const selectedNumbers = new Set();
const editingRows = new Map();

function getToken() {
  return elements.adminToken.value.trim();
}

function setStatus(message, type = '') {
  elements.adminStatus.textContent = message;
  elements.adminStatus.className = `status-message ${type}`.trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toggleBulkEditor() {
  elements.bulkEditor.style.display = selectedNumbers.size ? 'block' : 'none';
}

function clearBulkInputs() {
  elements.bulkStatus.value = '';
  elements.bulkPayerName.value = '';
  elements.bulkPayerPhone.value = '';
  elements.bulkPayerEmail.value = '';
  elements.bulkPayerRut.value = '';
  elements.bulkPaymentChannel.value = '';
  elements.bulkNotes.value = '';
}

function stopRowClick(event) {
  event.stopPropagation();
}

function toggleRowSelection(number, checked) {
  if (checked) {
    selectedNumbers.add(number);
  } else {
    selectedNumbers.delete(number);
  }
  renderRows(currentTickets);
}

function toggleRowSelectionFromRow(number) {
  if (selectedNumbers.has(number)) {
    selectedNumbers.delete(number);
  } else {
    selectedNumbers.add(number);
  }
  renderRows(currentTickets);
}

function renderRows(rows) {
  currentTickets = rows;

  elements.adminTableBody.innerHTML = rows.map((row) => {
    const isSelected = selectedNumbers.has(row.number);
    const isEditing = editingRows.has(row.number);

    if (isEditing) {
      const draft = editingRows.get(row.number);

      return `
        <tr class="${isSelected ? 'admin-row-selected' : ''}">
          <td onclick="stopRowClick(event)">
            <input
              class="admin-check"
              type="checkbox"
              ${isSelected ? 'checked' : ''}
              onchange="toggleRowSelection(${row.number}, this.checked)"
            />
          </td>
          <td>${row.number}</td>
          <td onclick="stopRowClick(event)">
            <select id="edit-status-${row.number}" class="admin-inline-select">
              <option value="available" ${draft.status === 'available' ? 'selected' : ''}>available</option>
              <option value="reserved" ${draft.status === 'reserved' ? 'selected' : ''}>reserved</option>
              <option value="paid" ${draft.status === 'paid' ? 'selected' : ''}>paid</option>
            </select>
          </td>
          <td onclick="stopRowClick(event)">
            <input id="edit-payer-name-${row.number}" class="admin-inline-input" value="${escapeHtml(draft.payer_name)}" />
          </td>
          <td onclick="stopRowClick(event)">
            <input id="edit-payer-phone-${row.number}" class="admin-inline-input" value="${escapeHtml(draft.payer_phone)}" />
          </td>
          <td onclick="stopRowClick(event)">
            <input id="edit-payer-email-${row.number}" class="admin-inline-input" value="${escapeHtml(draft.payer_email)}" />
          </td>
          <td onclick="stopRowClick(event)">
            <input id="edit-payment-channel-${row.number}" class="admin-inline-input" value="${escapeHtml(draft.payment_channel)}" />
          </td>
          <td onclick="stopRowClick(event)">
            <div class="admin-inline-actions">
              <button type="button" onclick="saveInlineRow(${row.number}); stopRowClick(event);">Guardar</button>
              <button type="button" onclick="cancelInlineEdit(${row.number}); stopRowClick(event);">Cancelar</button>
            </div>
          </td>
        </tr>
      `;
    }

    return `
      <tr class="${isSelected ? 'admin-row-selected' : ''}" onclick="toggleRowSelectionFromRow(${row.number})" style="cursor:pointer;">
        <td onclick="stopRowClick(event)">
          <input
            class="admin-check"
            type="checkbox"
            ${isSelected ? 'checked' : ''}
            onchange="toggleRowSelection(${row.number}, this.checked)"
          />
        </td>
        <td>${row.number ?? ''}</td>
        <td>${row.status ?? ''}</td>
        <td>${row.payer_name ?? ''}</td>
        <td>${row.payer_phone ?? ''}</td>
        <td>${row.payer_email ?? ''}</td>
        <td>${row.payment_channel ?? ''}</td>
        <td onclick="stopRowClick(event)">
          <div class="admin-inline-actions">
            <button type="button" onclick="startInlineEdit(${row.number}); stopRowClick(event);">Editar</button>
            <button type="button" onclick="releaseNumber(${row.number}); stopRowClick(event);">Liberar</button>
            <button type="button" onclick="markAsPaid(${row.number}); stopRowClick(event);">Pagado</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const total = rows.length;
  const paid = rows.filter((row) => row.status === 'paid').length;
  const reserved = rows.filter((row) => row.status === 'reserved').length;
  const available = rows.filter((row) => row.status === 'available').length;

  elements.metricTotal.textContent = total;
  elements.metricPaid.textContent = paid;
  elements.metricReserved.textContent = reserved;
  elements.metricAvailable.textContent = available;

  toggleBulkEditor();
}

function startInlineEdit(number) {
  const ticket = currentTickets.find((row) => row.number === number);
  if (!ticket) return;

  editingRows.set(number, {
    status: ticket.status ?? 'available',
    payer_name: ticket.payer_name ?? '',
    payer_phone: ticket.payer_phone ?? '',
    payer_email: ticket.payer_email ?? '',
    payment_channel: ticket.payment_channel ?? '',
  });

  renderRows(currentTickets);
  setStatus(`Editando número ${number}.`, 'warning');
}

function cancelInlineEdit(number) {
  editingRows.delete(number);
  renderRows(currentTickets);
}

async function saveInlineRow(number) {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  const data = {
    status: document.getElementById(`edit-status-${number}`).value,
    payer_name: document.getElementById(`edit-payer-name-${number}`).value.trim() || null,
    payer_phone: document.getElementById(`edit-payer-phone-${number}`).value.trim() || null,
    payer_email: document.getElementById(`edit-payer-email-${number}`).value.trim() || null,
    payment_channel: document.getElementById(`edit-payment-channel-${number}`).value.trim() || null,
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

    editingRows.delete(number);
    await loadAdminData();
    setStatus(`Número ${number} actualizado correctamente.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Error al guardar cambios del número.', 'error');
  }
}

async function applyBulkEdit() {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  const numbers = Array.from(selectedNumbers);
  if (!numbers.length) {
    setStatus('Debes seleccionar al menos un número.', 'warning');
    return;
  }

  const data = {};
  if (elements.bulkStatus.value) data.status = elements.bulkStatus.value;
  if (elements.bulkPayerName.value.trim()) data.payer_name = elements.bulkPayerName.value.trim();
  if (elements.bulkPayerPhone.value.trim()) data.payer_phone = elements.bulkPayerPhone.value.trim();
  if (elements.bulkPayerEmail.value.trim()) data.payer_email = elements.bulkPayerEmail.value.trim();
  if (elements.bulkPayerRut.value.trim()) data.payer_rut = elements.bulkPayerRut.value.trim();
  if (elements.bulkPaymentChannel.value.trim()) data.payment_channel = elements.bulkPaymentChannel.value.trim();
  if (elements.bulkNotes.value.trim()) data.notes = elements.bulkNotes.value.trim();

  if (!Object.keys(data).length) {
    setStatus('Completa al menos un campo para aplicar edición masiva.', 'warning');
    return;
  }

  try {
    for (const number of numbers) {
      const response = await fetch(`${API_BASE}/api/admin/update-ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({ number, data }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `No fue posible actualizar el número ${number}.`);
    }

    clearBulkInputs();
    editingRows.clear();
    await loadAdminData();
    setStatus(`Se actualizaron ${numbers.length} número(s) correctamente.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Error en edición masiva.', 'error');
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

async function releaseSelectedNumbers() {
  const token = getToken();
  if (!token) {
    setStatus('Debes ingresar el token administrador.', 'warning');
    return;
  }

  const numbers = Array.from(selectedNumbers);
  if (!numbers.length) {
    setStatus('Debes seleccionar al menos un número.', 'warning');
    return;
  }

  try {
    for (const number of numbers) {
      const response = await fetch(`${API_BASE}/api/admin/release-ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({ number }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `No fue posible liberar el número ${number}.`);
    }

    selectedNumbers.clear();
    editingRows.clear();
    await loadAdminData();
    setStatus(`Se liberaron ${numbers.length} número(s) correctamente.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Error al liberar seleccionados.', 'error');
  }
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
    <div class="prize-item">
      <div class="prize-item-row">
        <img src="${p.image}" alt="${escapeHtml(p.title)}" />
        <div style="flex:1; min-width:220px;">
          <strong>${p.title}</strong>
          <div>${p.description}</div>
        </div>
        <div class="prize-item-actions">
          <button type="button" onclick='editPrize(${JSON.stringify(p).replace(/"/g, '&quot;')})'>Editar</button>
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

function selectAllVisible() {
  currentTickets.forEach((ticket) => selectedNumbers.add(ticket.number));
  renderRows(currentTickets);
}

function clearSelected() {
  selectedNumbers.clear();
  renderRows(currentTickets);
}

elements.loadAdminBtn.addEventListener('click', loadAdminData);
elements.selectAllBtn.addEventListener('click', selectAllVisible);
elements.clearSelectedBtn.addEventListener('click', clearSelected);
elements.bulkEditBtn.addEventListener('click', toggleBulkEditor);
elements.bulkReleaseBtn.addEventListener('click', releaseSelectedNumbers);
elements.applyBulkBtn.addEventListener('click', applyBulkEdit);
elements.addPrizeBtn.addEventListener('click', savePrize);

window.releaseNumber = releaseNumber;
window.markAsPaid = markAsPaid;
window.deletePrize = deletePrize;
window.editPrize = editPrize;
window.startInlineEdit = startInlineEdit;
window.cancelInlineEdit = cancelInlineEdit;
window.saveInlineRow = saveInlineRow;
window.toggleRowSelection = toggleRowSelection;
window.toggleRowSelectionFromRow = toggleRowSelectionFromRow;
window.stopRowClick = stopRowClick;
