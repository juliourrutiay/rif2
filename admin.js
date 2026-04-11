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
// 👉 AGREGA ESTO AL FINAL DEL ARCHIVO  [oai_citation:0‡server.js](sediment://file_00000000df04720ebb940f243f61d18d)

// =======================
// ADMIN - UPDATE TICKET
// =======================
app.post('/api/admin/update-ticket', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { number, data } = req.body;

    const { error } = await supabase
      .from('raffle_tickets')
      .update(data)
      .eq('raffle_id', RAFFLE_ID)
      .eq('number', number);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ADMIN - RELEASE
// =======================
app.post('/api/admin/release-ticket', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { number } = req.body;

    const { error } = await supabase
      .from('raffle_tickets')
      .update({
        status: 'available',
        reserved_until: null,
        payer_name: null,
        payer_email: null,
        payer_phone: null,
      })
      .eq('raffle_id', RAFFLE_ID)
      .eq('number', number);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PREMIOS CRUD
// =======================
app.get('/api/prizes', async (_req, res) => {
  const { data } = await supabase.from('raffle_prizes').select('*').order('id');
  res.json({ prizes: data || [] });
});

app.post('/api/admin/prizes', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return unauthorized(res);

  const { title, description, image } = req.body;

  await supabase.from('raffle_prizes').insert([{ title, description, image }]);

  res.json({ ok: true });
});

app.delete('/api/admin/prizes/:id', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return unauthorized(res);

  await supabase.from('raffle_prizes').delete().eq('id', req.params.id);

  res.json({ ok: true });
});
