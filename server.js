import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';
const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || FRONTEND_URL;
const RAFFLE_ID = process.env.RAFFLE_ID || 'rifa-verde';
const RAFFLE_TITLE = process.env.RAFFLE_TITLE || 'Rifa Verde';
const RAFFLE_PRICE = Number(process.env.RAFFLE_PRICE || 2000);
const RAFFLE_SIZE = Number(process.env.RAFFLE_SIZE || 100);
const RESERVATION_MINUTES = Number(process.env.RESERVATION_MINUTES || 10);
const KHIPU_BASE_URL = process.env.KHIPU_BASE_URL || 'https://payment-api.khipu.com';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cambiar-este-token';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://example.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key'
);

app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanNumberList(numbers) {
  return [...new Set((numbers || []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= RAFFLE_SIZE))].sort((a, b) => a - b);
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Token administrador inválido.' });
}

async function releaseExpiredReservations() {
  await supabase
    .from('raffle_tickets')
    .update({
      status: 'available',
      reserved_until: null,
      payer_name: null,
      payer_email: null,
      payer_phone: null,
      payer_rut: null,
      payment_id: null,
      transaction_id: null,
      payment_channel: null,
      notes: null,
    })
    .eq('raffle_id', RAFFLE_ID)
    .eq('status', 'reserved')
    .lt('reserved_until', nowIso());
}

async function ensureRaffleNumbers(size) {
  const { count } = await supabase
    .from('raffle_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('raffle_id', RAFFLE_ID);

  if ((count || 0) >= size) return;

  const rows = [];
  for (let number = 1; number <= size; number += 1) {
    rows.push({ raffle_id: RAFFLE_ID, number, status: 'available' });
  }

  await supabase.from('raffle_tickets').upsert(rows, { onConflict: 'raffle_id,number', ignoreDuplicates: true });
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, raffleId: RAFFLE_ID });
});

app.get('/api/numbers', async (_req, res) => {
  try {
    await ensureRaffleNumbers(RAFFLE_SIZE);
    await releaseExpiredReservations();

    const { data, error } = await supabase
      .from('raffle_tickets')
      .select('number,status,reserved_until')
      .eq('raffle_id', RAFFLE_ID)
      .order('number', { ascending: true });

    if (error) throw error;
    res.json({ numbers: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error al consultar números.' });
  }
});

app.post('/api/payments/create', async (req, res) => {
  try {
    const numbers = cleanNumberList(req.body.numbers);
    const { payerName, payerEmail, payerPhone, payerRut } = req.body;

    if (!numbers.length) return res.status(400).json({ error: 'Debes indicar uno o más números.' });
    if (!payerName || !payerEmail || !payerPhone) {
      return res.status(400).json({ error: 'Debes completar nombre, mail y celular.' });
    }

    await ensureRaffleNumbers(RAFFLE_SIZE);
    await releaseExpiredReservations();

    const { data: tickets, error: ticketsError } = await supabase
      .from('raffle_tickets')
      .select('*')
      .eq('raffle_id', RAFFLE_ID)
      .in('number', numbers)
      .order('number', { ascending: true });

    if (ticketsError) throw ticketsError;

    const unavailable = (tickets || []).filter((ticket) => ticket.status !== 'available').map((ticket) => ticket.number);
    if (unavailable.length) {
      return res.status(409).json({ error: `Estos números ya no están disponibles: ${unavailable.join(', ')}` });
    }

    const transactionId = `${RAFFLE_ID}-${Date.now()}`;
    const reservedUntil = addMinutes(new Date(), RESERVATION_MINUTES).toISOString();

    const { error: reserveError } = await supabase
      .from('raffle_tickets')
      .update({
        status: 'reserved',
        reserved_until: reservedUntil,
        payer_name: payerName,
        payer_email: payerEmail,
        payer_phone: payerPhone,
        payer_rut: payerRut || null,
        transaction_id: transactionId,
      })
      .eq('raffle_id', RAFFLE_ID)
      .in('number', numbers)
      .eq('status', 'available');

    if (reserveError) throw reserveError;

    const notifyUrl = `${req.protocol}://${req.get('host')}/api/payments/webhook`;

    const paymentPayload = {
      amount: RAFFLE_PRICE * numbers.length,
      currency: 'CLP',
      subject: `${RAFFLE_TITLE} - Números ${numbers.join(', ')}`,
      transaction_id: transactionId,
      return_url: `${PUBLIC_FRONTEND_URL}/index.html?status=success`,
      cancel_url: `${PUBLIC_FRONTEND_URL}/index.html?status=cancel`,
      notify_url: notifyUrl,
      payer_name: payerName,
      payer_email: payerEmail,
      custom: JSON.stringify({ raffleId: RAFFLE_ID, numbers, payerPhone, payerRut }),
    };

    const khipuResponse = await fetch(`${KHIPU_BASE_URL}/v3/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.KHIPU_API_KEY,
      },
      body: JSON.stringify(paymentPayload),
    });

    const khipuData = await khipuResponse.json();
    if (!khipuResponse.ok) {
      await supabase
        .from('raffle_tickets')
        .update({ status: 'available', reserved_until: null, payer_name: null, payer_email: null, payer_phone: null, payer_rut: null, transaction_id: null })
        .eq('raffle_id', RAFFLE_ID)
        .in('number', numbers);

      return res.status(400).json({ error: khipuData.message || 'Khipu no pudo crear el cobro.', details: khipuData });
    }

    await supabase
      .from('raffle_tickets')
      .update({ payment_id: khipuData.payment_id, payment_channel: 'khipu' })
      .eq('raffle_id', RAFFLE_ID)
      .in('number', numbers);

    res.json({ ok: true, payment_id: khipuData.payment_id, payment_url: khipuData.payment_url, transaction_id: transactionId, reserved_until: reservedUntil });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No fue posible generar el pago.' });
  }
});

app.post('/api/payments/webhook', async (req, res) => {
  try {
    const paymentId = req.body.payment_id || req.body.api_version ? req.body.payment_id : req.body.paymentId;
    if (!paymentId) return res.status(400).json({ error: 'Webhook sin payment_id.' });

    const verifyResponse = await fetch(`${KHIPU_BASE_URL}/v3/payments/${paymentId}`, {
      headers: { 'x-api-key': process.env.KHIPU_API_KEY },
    });

    const verifyData = await verifyResponse.json();
    if (!verifyResponse.ok) return res.status(400).json({ error: 'No fue posible verificar el pago en Khipu.', details: verifyData });

    if (verifyData.status !== 'done') {
      return res.status(200).json({ ok: true, ignored: true, status: verifyData.status });
    }

    const { data: tickets, error } = await supabase
      .from('raffle_tickets')
      .select('number,transaction_id')
      .eq('raffle_id', RAFFLE_ID)
      .eq('payment_id', paymentId);

    if (error) throw error;

    const numbers = (tickets || []).map((ticket) => ticket.number);
    if (!numbers.length) return res.status(200).json({ ok: true, ignored: true });

    await supabase
      .from('raffle_tickets')
      .update({
        status: 'paid',
        reserved_until: null,
        payment_channel: 'khipu',
      })
      .eq('raffle_id', RAFFLE_ID)
      .in('number', numbers);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error al procesar webhook.' });
  }
});

app.get('/api/admin/tickets', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { data, error } = await supabase
      .from('raffle_tickets')
      .select('*')
      .eq('raffle_id', RAFFLE_ID)
      .order('number', { ascending: true });

    if (error) throw error;
    res.json({ tickets: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No fue posible consultar tickets.' });
  }
});

app.get('/api/admin/export.csv', async (req, res) => {
  const token = req.query.token || req.get('x-admin-token');
  if (token !== ADMIN_TOKEN) return res.status(401).send('Token inválido');

  try {
    const { data, error } = await supabase
      .from('raffle_tickets')
      .select('*')
      .eq('raffle_id', RAFFLE_ID)
      .order('number', { ascending: true });

    if (error) throw error;

    const headers = ['number', 'status', 'payer_name', 'payer_phone', 'payer_email', 'payer_rut', 'payment_channel', 'transaction_id', 'payment_id', 'notes'];
    const rows = [headers.join(',')].concat(
      (data || []).map((row) => headers.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(','))
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${RAFFLE_ID}-tickets.csv"`);
    res.send(rows.join('\n'));
  } catch (error) {
    res.status(500).send(error.message || 'No fue posible exportar el CSV.');
  }
});

app.post('/api/admin/assign-manual', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const numbers = cleanNumberList(req.body.numbers);
    const { payerName, payerEmail, payerPhone, payerRut, notes } = req.body;

    if (!numbers.length) return res.status(400).json({ error: 'Debes enviar uno o más números.' });
    if (!payerName || !payerPhone || !payerEmail) return res.status(400).json({ error: 'Faltan datos del comprador.' });

    await ensureRaffleNumbers(RAFFLE_SIZE);
    await releaseExpiredReservations();

    const { data: tickets, error: ticketsError } = await supabase
      .from('raffle_tickets')
      .select('*')
      .eq('raffle_id', RAFFLE_ID)
      .in('number', numbers);

    if (ticketsError) throw ticketsError;

    const unavailable = (tickets || []).filter((ticket) => ticket.status === 'paid').map((ticket) => ticket.number);
    if (unavailable.length) {
      return res.status(409).json({ error: `Estos números ya están pagados: ${unavailable.join(', ')}` });
    }

    const transactionId = `manual-${Date.now()}`;

    const { error } = await supabase
      .from('raffle_tickets')
      .update({
        status: 'paid',
        reserved_until: null,
        payer_name: payerName,
        payer_email: payerEmail,
        payer_phone: payerPhone,
        payer_rut: payerRut || null,
        transaction_id: transactionId,
        payment_channel: 'manual',
        notes: notes || null,
      })
      .eq('raffle_id', RAFFLE_ID)
      .in('number', numbers);

    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No fue posible asignar manualmente.' });
  }
});

app.listen(PORT, async () => {
  await ensureRaffleNumbers(RAFFLE_SIZE);
  console.log(`Rifa backend escuchando en http://localhost:${PORT}`);
});

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
