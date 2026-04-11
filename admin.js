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
};

let editingPrizeId = null;

function getToken() {
  return elements.adminToken.value.trim();
}

function setStatus(message, type = '') {
  elements.adminStatus.textContent = message;
  elements.adminStatus.className = `status-message ${type}`.trim();
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

  try {
    const response = await fetch(`${API_BASE}/api/admin/update-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify({
        number,
        data: { status: 'paid', payment_channel: 'manual' },
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
          <button type="button" onclick='editPrize(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Editar</button>
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

if (elements.addPrizeBtn) {
  elements.addPrizeBtn.addEventListener('click', savePrize);
}

window.releaseNumber = releaseNumber;
window.markAsPaid = markAsPaid;
window.deletePrize = deletePrize;
window.editPrize = editPrize;
