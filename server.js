import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();

app.set('trust proxy', true);

const PORT = Number(process.env.PORT || 8787);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';
const PUBLIC_FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || FRONTEND_URL).replace(/\/+$/, '');

const BACKEND_PUBLIC_URL = (
  process.env.BACKEND_PUBLIC_URL || 'https://rifa-backend-xvti.onrender.com'
).replace(/\/+$/, '');

const RAFFLE_ID = process.env.RAFFLE_ID || 'rifa-verde';
const RAFFLE_TITLE = process.env.RAFFLE_TITLE || 'Rifa Contact Center';
const RAFFLE_PRICE = Number(process.env.RAFFLE_PRICE || 2000);
const RAFFLE_SIZE = Number(process.env.RAFFLE_SIZE || 1000);
const FLOW_PAYMENT_TIMEOUT_SECONDS = Number(process.env.FLOW_PAYMENT_TIMEOUT_SECONDS || 900);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cambiar-este-token';

const FLOW_BASE_URL = process.env.FLOW_BASE_URL || 'https://sandbox.flow.cl/api';
const FLOW_API_KEY = process.env.FLOW_API_KEY || '';
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function nowIso() {
  return new Date().toISOString();
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Token administrador inválido.' });
}

function backendBaseUrl() {
  return BACKEND_PUBLIC_URL;
}

function cleanQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1) return 0;
  if (quantity > RAFFLE_SIZE) return 0;
  return quantity;
}

function signFlowParams(params) {
  const keys = Object.keys(params).sort();
  const stringToSign = keys.map((key) => `${key}${params[key]}`).join('');

  return crypto
    .createHmac('sha256', FLOW_SECRET_KEY)
    .update(stringToSign)
    .digest('hex');
}

function buildSignedFlowPayload(params) {
  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
    throw new Error('Faltan FLOW_API_KEY o FLOW_SECRET_KEY en Render.');
  }

  const payload = {
    ...params,
    apiKey: FLOW_API_KEY,
  };

  payload.s = signFlowParams(payload);

  return payload;
}

async function parseFlowResponse(response) {
  const text = await response.text();
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Respuesta inválida de Flow: ${text}`);
  }

  if (!response.ok) {
    throw new Error(json.message || json.error || 'Flow respondió con error.');
  }

  return json;
}

async function callFlowPost(endpoint, params) {
  const payload = buildSignedFlowPayload(params);

  const response = await fetch(`${FLOW_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(payload),
  });

  return parseFlowResponse(response);
}

async function callFlowGet(endpoint, params) {
  const payload = buildSignedFlowPayload(params);
  const queryString = new URLSearchParams(payload).toString();

  const response = await fetch(`${FLOW_BASE_URL}${endpoint}?${queryString}`, {
    method: 'GET',
  });

  return parseFlowResponse(response);
}

async function ensureRaffleNumbers(size) {
  const { count, error: countError } = await supabase
    .from('raffle_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('raffle_id', RAFFLE_ID);

  if (countError) throw countError;
  if ((count || 0) >= size) return;

  const rows = [];

  for (let number = 1; number <= size; number += 1) {
    rows.push({
      raffle_id: RAFFLE_ID,
      number,
      status: 'available',
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  const { error } = await supabase
    .from('raffle_tickets')
    .upsert(rows, {
      onConflict: 'raffle_id,number',
      ignoreDuplicates: true,
    });

  if (error) throw error;
}

async function countAvailableTickets() {
  const { count, error } = await supabase
    .from('raffle_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('raffle_id', RAFFLE_ID)
    .eq('status', 'available');

  if (error) throw error;
  return count || 0;
}

async function assignSequentialTicketsToOrder(order) {
  const quantity = Number(order.quantity);

  const { data: availableTickets, error: selectError } = await supabase
    .from('raffle_tickets')
    .select('number')
    .eq('raffle_id', RAFFLE_ID)
    .eq('status', 'available')
    .order('number', { ascending: true })
    .limit(quantity);

  if (selectError) throw selectError;

  if (!availableTickets || availableTickets.length < quantity) {
    throw new Error('No quedan suficientes oportunidades disponibles para asignar.');
  }

  const numbers = availableTickets.map((ticket) => ticket.number);

  const { data: updatedTickets, error: updateError } = await supabase
    .from('raffle_tickets')
    .update({
      status: 'paid',
      reserved_until: null,
      payer_name: order.payer_name,
      payer_email: order.payer_email,
      payer_phone: order.payer_phone,
      payer_rut: order.payer_rut || null,
      payment_id: order.payment_id,
      transaction_id: order.transaction_id,
      payment_channel: 'flow',
      notes: `Compra automática de ${quantity} oportunidad(es) vía Flow`,
      updated_at: nowIso(),
    })
    .eq('raffle_id', RAFFLE_ID)
    .in('number', numbers)
    .eq('status', 'available')
    .select('number');

  if (updateError) throw updateError;

  if (!updatedTickets || updatedTickets.length !== quantity) {
    const partiallyAssigned = (updatedTickets || []).map((ticket) => ticket.number);

    if (partiallyAssigned.length) {
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
          updated_at: nowIso(),
        })
        .eq('raffle_id', RAFFLE_ID)
        .in('number', partiallyAssigned)
        .eq('transaction_id', order.transaction_id);
    }

    await supabase
      .from('raffle_orders')
      .update({
        status: 'assignment_error',
        assigned_numbers: partiallyAssigned,
      })
      .eq('transaction_id', order.transaction_id);

    throw new Error('No fue posible asignar todas las oportunidades. Revisa disponibilidad en admin.');
  }

  const assignedNumbers = updatedTickets
    .map((ticket) => ticket.number)
    .sort((a, b) => a - b);

  const { error: orderUpdateError } = await supabase
    .from('raffle_orders')
    .update({
      status: 'paid',
      assigned_numbers: assignedNumbers,
      paid_at: nowIso(),
    })
    .eq('transaction_id', order.transaction_id);

  if (orderUpdateError) throw orderUpdateError;

  return assignedNumbers;
}

async function confirmFlowPaymentByToken(token) {
  const statusData = await callFlowGet('/payment/getStatus', { token });

  const flowStatus = Number(statusData.status);
  const transactionId = statusData.commerceOrder;

  if (!transactionId) {
    return { ok: false, status: flowStatus, reason: 'Sin commerceOrder.' };
  }

  const { data: order, error: orderError } = await supabase
    .from('raffle_orders')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (orderError) throw orderError;

  if (!order) {
    return { ok: false, status: flowStatus, reason: 'Orden no encontrada.' };
  }

  if (order.status === 'paid') {
    return {
      ok: true,
      status: flowStatus,
      alreadyPaid: true,
      quantity: order.quantity,
      assignedNumbers: order.assigned_numbers || [],
    };
  }

  if (flowStatus === 2) {
    await supabase
      .from('raffle_orders')
      .update({
        payment_id: token,
        payment_channel: 'flow',
      })
      .eq('transaction_id', transactionId);

    const orderForAssignment = {
      ...order,
      payment_id: token,
      payment_channel: 'flow',
    };

    const assignedNumbers = await assignSequentialTicketsToOrder(orderForAssignment);

    return {
      ok: true,
      status: flowStatus,
      quantity: order.quantity,
      assignedNumbers,
    };
  }

  if (flowStatus === 3 || flowStatus === 4) {
    await supabase
      .from('raffle_orders')
      .update({
        status: 'cancelled',
        payment_id: token,
        payment_channel: 'flow',
      })
      .eq('transaction_id', transactionId);

    return { ok: false, status: flowStatus, cancelled: true };
  }

  return { ok: false, status: flowStatus, pending: true };
}

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    raffleId: RAFFLE_ID,
    raffleTitle: RAFFLE_TITLE,
    raffleSize: RAFFLE_SIZE,
    backendPublicUrl: BACKEND_PUBLIC_URL,
    publicFrontendUrl: PUBLIC_FRONTEND_URL,
    flowBaseUrl: FLOW_BASE_URL,
    hasFlowApiKey: Boolean(FLOW_API_KEY),
    hasFlowSecretKey: Boolean(FLOW_SECRET_KEY),
  });
});

app.get('/api/public/summary', async (_req, res) => {
  try {
    await ensureRaffleNumbers(RAFFLE_SIZE);

    const available = await countAvailableTickets();

    res.json({
      ok: true,
      price: RAFFLE_PRICE,
      available,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'No fue posible consultar el resumen público.',
    });
  }
});

app.post('/api/flow/create', async (req, res) => {
  try {
    const quantity = cleanQuantity(req.body.quantity);
    const { payerName, payerEmail, payerPhone, payerRut } = req.body;

    if (!quantity) {
      return res.status(400).json({
        error: 'Debes indicar una cantidad válida de oportunidades.',
      });
    }

    if (!payerName || !payerEmail || !payerPhone) {
      return res.status(400).json({
        error: 'Debes completar nombre, mail y celular.',
      });
    }

    await ensureRaffleNumbers(RAFFLE_SIZE);

    const available = await countAvailableTickets();

    if (available < quantity) {
      return res.status(409).json({
        error: `No quedan suficientes oportunidades disponibles. Disponibles actuales: ${available}.`,
      });
    }

    const transactionId = `flow-${RAFFLE_ID}-${Date.now()}`;
    const amount = RAFFLE_PRICE * quantity;

    const { error: orderError } = await supabase
      .from('raffle_orders')
      .insert([
        {
          raffle_id: RAFFLE_ID,
          transaction_id: transactionId,
          payment_channel: 'flow',
          payment_id: null,
          payer_name: payerName,
          payer_email: payerEmail,
          payer_phone: payerPhone,
          payer_rut: payerRut || null,
          quantity,
          amount,
          assigned_numbers: [],
          status: 'pending',
          created_at: nowIso(),
        },
      ]);

    if (orderError) throw orderError;

    const flowResponse = await callFlowPost('/payment/create', {
      commerceOrder: transactionId,
      subject: `${RAFFLE_TITLE} - ${quantity} oportunidad(es)`,
      currency: 'CLP',
      amount: String(amount),
      email: payerEmail,
      paymentMethod: '9',
      urlConfirmation: `${backendBaseUrl()}/api/flow/confirmation`,
      urlReturn: `${backendBaseUrl()}/api/flow/return`,
      optional: JSON.stringify({
        raffleId: RAFFLE_ID,
        quantity,
        payerName,
        payerEmail,
        payerPhone,
      }),
      timeout: String(FLOW_PAYMENT_TIMEOUT_SECONDS),
      checkout_timeout: String(FLOW_PAYMENT_TIMEOUT_SECONDS),
    });

    await supabase
      .from('raffle_orders')
      .update({
        payment_id: flowResponse.token || null,
      })
      .eq('transaction_id', transactionId);

    res.json({
      ok: true,
      payment_url: `${flowResponse.url}?token=${flowResponse.token}`,
      token: flowResponse.token,
      transaction_id: transactionId,
      quantity,
      amount,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'No fue posible generar pago con Flow.',
    });
  }
});

app.post('/api/flow/confirmation', async (req, res) => {
  try {
    const token = req.body.token || req.query.token;

    if (!token) {
      return res.status(400).send('Token faltante');
    }

    await confirmFlowPaymentByToken(token);

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Flow confirmation error:', error);
    return res.status(500).send('ERROR');
  }
});

app.all('/api/flow/return', async (req, res) => {
  try {
    const token = req.body.token || req.query.token;

    if (!token) {
      return res.redirect(`${PUBLIC_FRONTEND_URL}?status=cancel`);
    }

    const result = await confirmFlowPaymentByToken(token);

    if (result.ok) {
      return res.redirect(
        `${PUBLIC_FRONTEND_URL}?status=success&qty=${encodeURIComponent(result.quantity || '')}`
      );
    }

    if (result.cancelled) {
      return res.redirect(`${PUBLIC_FRONTEND_URL}?status=cancel`);
    }

    return res.redirect(`${PUBLIC_FRONTEND_URL}?status=pending`);
  } catch (error) {
    console.error('Flow return error:', error);
    return res.redirect(`${PUBLIC_FRONTEND_URL}?status=error`);
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

app.get('/api/admin/orders', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { data, error } = await supabase
      .from('raffle_orders')
      .select('*')
      .eq('raffle_id', RAFFLE_ID)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ orders: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No fue posible consultar órdenes.' });
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

    const headers = [
      'number',
      'status',
      'payer_name',
      'payer_phone',
      'payer_email',
      'payer_rut',
      'payment_channel',
      'transaction_id',
      'payment_id',
      'notes',
    ];

    const rows = [headers.join(',')].concat(
      (data || []).map((row) =>
        headers.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')
      )
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${RAFFLE_ID}-tickets.csv"`);
    res.send(rows.join('\n'));
  } catch (error) {
    res.status(500).send(error.message || 'No fue posible exportar el CSV.');
  }
});

app.post('/api/admin/update-ticket', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { number, data } = req.body;

    const { error } = await supabase
      .from('raffle_tickets')
      .update({
        ...data,
        updated_at: nowIso(),
      })
      .eq('raffle_id', RAFFLE_ID)
      .eq('number', number);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No fue posible actualizar el ticket.' });
  }
});

app.post('/api/admin/release-ticket', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

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
        payer_rut: null,
        payment_id: null,
        transaction_id: null,
        payment_channel: null,
        notes: null,
        updated_at: nowIso(),
      })
      .eq('raffle_id', RAFFLE_ID)
      .eq('number', number);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No fue posible liberar el ticket.' });
  }
});

app.get('/api/prizes', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('raffle_prizes')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    res.json({ prizes: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No fue posible consultar los premios.' });
  }
});

app.post('/api/admin/prizes', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { title, description, image } = req.body;

    if (!title || !description || !image) {
      return res.status(400).json({ error: 'Debes completar título, descripción e imagen.' });
    }

    const { data, error } = await supabase
      .from('raffle_prizes')
      .insert([{ title, description, image }])
      .select();

    if (error) throw error;

    res.json({ ok: true, prize: data?.[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No fue posible agregar el premio.' });
  }
});

app.put('/api/admin/prizes/:id', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { title, description, image } = req.body;
    const { id } = req.params;

    if (!title || !description || !image) {
      return res.status(400).json({ error: 'Debes completar título, descripción e imagen.' });
    }

    const { data, error } = await supabase
      .from('raffle_prizes')
      .update({ title, description, image })
      .eq('id', id)
      .select();

    if (error) throw error;

    res.json({ ok: true, prize: data?.[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No fue posible actualizar el premio.' });
  }
});

app.delete('/api/admin/prizes/:id', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('raffle_prizes')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No fue posible eliminar el premio.' });
  }
});

app.get('/api/admin/draw-data', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { data, error } = await supabase
      .from('raffle_tickets')
      .select('number')
      .eq('raffle_id', RAFFLE_ID)
      .eq('status', 'paid')
      .order('number', { ascending: true });

    if (error) throw error;

    const { data: history, error: historyError } = await supabase
      .from('raffle_draws')
      .select('*')
      .eq('raffle_id', RAFFLE_ID)
      .order('created_at', { ascending: false });

    if (historyError) throw historyError;

    res.json({
      paid_numbers: (data || []).map((item) => item.number),
      draw_history: history || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No fue posible consultar datos del sorteo.' });
  }
});

app.post('/api/admin/draw', async (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) return unauthorized(res);

  try {
    const { prizeName, winnerNumber, discardedNumbers } = req.body;

    const { data, error } = await supabase
      .from('raffle_draws')
      .insert([
        {
          raffle_id: RAFFLE_ID,
          prize_name: prizeName || 'Premio sin nombre',
          winner_number: Number(winnerNumber),
          discarded_numbers: discardedNumbers || [],
          created_at: nowIso(),
        },
      ])
      .select();

    if (error) throw error;

    res.json({ ok: true, draw: data?.[0] || null });
  } catch (error) {
    res.status(500).json({ error: error.message || 'No fue posible guardar el sorteo.' });
  }
});

app.listen(PORT, async () => {
  await ensureRaffleNumbers(RAFFLE_SIZE);
  console.log(`Rifa backend escuchando en http://localhost:${PORT}`);
});
