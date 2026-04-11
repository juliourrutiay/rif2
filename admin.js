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
};

function setStatus(message, type = '') {
  elements.adminStatus.textContent = message;
  elements.adminStatus.className = `status-message ${type}`.trim();
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
  const token = elements.adminToken.value.trim();
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
    setStatus('Panel cargado correctamente.', 'success');
  } catch (error) {
    setStatus(error.message || 'Error al cargar el panel.', 'error');
  }
}

elements.loadAdminBtn.addEventListener('click', loadAdminData);
