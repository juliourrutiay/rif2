import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();

const PORT = Number(process.env.PORT || 8787);

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://127.0.0.1:5500';

const PUBLIC_FRONTEND_URL =
  (process.env.PUBLIC_FRONTEND_URL || FRONTEND_URL).replace(/\/+$/, '');

const RAFFLE_ID =
  process.env.RAFFLE_ID || 'rifa-verde';

const RAFFLE_TITLE =
  process.env.RAFFLE_TITLE || 'Rifa Contact Center';

const RAFFLE_PRICE =
  Number(process.env.RAFFLE_PRICE || 2000);

const RAFFLE_SIZE =
  Number(process.env.RAFFLE_SIZE || 500);

const RESERVATION_MINUTES =
  Number(process.env.RESERVATION_MINUTES || 10);

const TRANSFER_RESERVATION_MINUTES =
  Number(process.env.TRANSFER_RESERVATION_MINUTES || 15);

const TRANSFER_DISPLAY_MINUTES =
  Number(process.env.TRANSFER_DISPLAY_MINUTES || 10);

const ADMIN_TOKEN =
  process.env.ADMIN_TOKEN || 'cambiar-este-token';

const FLOW_BASE_URL =
  process.env.FLOW_BASE_URL || 'https://sandbox.flow.cl/api';

const FLOW_API_KEY =
  process.env.FLOW_API_KEY || '';

const FLOW_SECRET_KEY =
  process.env.FLOW_SECRET_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

app.use(cors({ origin: true }));

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

function addMinutes(date, minutes) {
  const next = new Date(date);

  next.setMinutes(next.getMinutes() + minutes);

  return next;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanNumberList(numbers) {
  return [
    ...new Set(
      (numbers || [])
        .map((n) => Number(n))
        .filter(
          (n) =>
            Number.isInteger(n) &&
            n >= 1 &&
            n <= RAFFLE_SIZE
        )
    ),
  ].sort((a, b) => a - b);
}

function unauthorized(res) {
  return res
    .status(401)
    .json({
      error: 'Token administrador inválido.',
    });
}

function signFlowParams(params) {
  const keys = Object.keys(params).sort();

  const stringToSign = keys
    .map((key) => `${key}${params[key]}`)
    .join('');

  return crypto
    .createHmac('sha256', FLOW_SECRET_KEY)
    .update(stringToSign)
    .digest('hex');
}

async function callFlow(endpoint, params) {
  const payload = {
    ...params,
    apiKey: FLOW_API_KEY,
  };

  payload.s = signFlowParams(payload);

  const response = await fetch(
    `${FLOW_BASE_URL}${endpoint}`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(payload),
    }
  );

  const text = await response.text();

  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Respuesta inválida de Flow: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      json.message ||
        'Flow respondió con error.'
    );
  }

  return json;
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
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('raffle_id', RAFFLE_ID);

  if ((count || 0) >= size) return;

  const rows = [];

  for (
    let number = 1;
    number <= size;
    number += 1
  ) {
    rows.push({
      raffle_id: RAFFLE_ID,
      number,
      status: 'available',
    });
  }

  await supabase
    .from('raffle_tickets')
    .upsert(rows, {
      onConflict: 'raffle_id,number',
      ignoreDuplicates: true,
    });
}

async function getRequestedTickets(numbers) {
  const { data, error } = await supabase
    .from('raffle_tickets')
    .select('*')
    .eq('raffle_id', RAFFLE_ID)
    .in('number', numbers)
    .order('number', {
      ascending: true,
    });

  if (error) throw error;

  return data || [];
}

function getUnavailableNumbers(tickets) {
  return (tickets || [])
    .filter(
      (ticket) =>
        ticket.status !== 'available'
    )
    .map((ticket) => ticket.number);
}

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    raffleId: RAFFLE_ID,
  });
});

app.get('/api/numbers', async (_req, res) => {
  try {
    await ensureRaffleNumbers(RAFFLE_SIZE);

    await releaseExpiredReservations();

    const { data, error } = await supabase
      .from('raffle_tickets')
      .select(
        'number,status,reserved_until'
      )
      .eq('raffle_id', RAFFLE_ID)
      .order('number', {
        ascending: true,
      });

    if (error) throw error;

    res.json({
      numbers: data || [],
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'Error al consultar números.',
    });
  }
});

app.post(
  '/api/flow/create',
  async (req, res) => {
    try {
      const numbers = cleanNumberList(
        req.body.numbers
      );

      const {
        payerName,
        payerEmail,
        payerPhone,
        payerRut,
      } = req.body;

      if (!numbers.length) {
        return res.status(400).json({
          error:
            'Debes indicar uno o más números.',
        });
      }

      if (
        !payerName ||
        !payerEmail ||
        !payerPhone
      ) {
        return res.status(400).json({
          error:
            'Debes completar nombre, mail y celular.',
        });
      }

      await ensureRaffleNumbers(
        RAFFLE_SIZE
      );

      await releaseExpiredReservations();

      const tickets =
        await getRequestedTickets(
          numbers
        );

      const unavailable =
        getUnavailableNumbers(tickets);

      if (unavailable.length) {
        return res.status(409).json({
          error: `Estos números ya no están disponibles: ${unavailable.join(
            ', '
          )}`,
        });
      }

      const transactionId = `flow-${Date.now()}`;

      const reservedUntil = addMinutes(
        new Date(),
        RESERVATION_MINUTES
      ).toISOString();

      const { error: reserveError } =
        await supabase
          .from('raffle_tickets')
          .update({
            status: 'reserved',
            reserved_until:
              reservedUntil,
            payer_name: payerName,
            payer_email: payerEmail,
            payer_phone: payerPhone,
            payer_rut:
              payerRut || null,
            transaction_id:
              transactionId,
            payment_channel:
              'flow',
          })
          .eq(
            'raffle_id',
            RAFFLE_ID
          )
          .in('number', numbers)
          .eq(
            'status',
            'available'
          );

      if (reserveError)
        throw reserveError;

      const amount =
        RAFFLE_PRICE *
        numbers.length;

      const flowResponse =
        await callFlow(
          '/payment/create',
          {
            commerceOrder:
              transactionId,

            subject: `${RAFFLE_TITLE} - ${numbers.length} número(s)`,

            currency: 'CLP',

            amount: String(amount),

            email: payerEmail,

            urlConfirmation: `${PUBLIC_FRONTEND_URL}/api/flow/confirmation`,

            urlReturn: `${PUBLIC_FRONTEND_URL}?flow=success`,
          }
        );

      await supabase
        .from('raffle_tickets')
        .update({
          payment_id:
            flowResponse.token ||
            null,
        })
        .eq(
          'raffle_id',
          RAFFLE_ID
        )
        .in('number', numbers);

      return res.json({
        ok: true,
        payment_url:
          flowResponse.url +
          '?token=' +
          flowResponse.token,

        token:
          flowResponse.token,

        reserved_until:
          reservedUntil,
      });
    } catch (error) {
      return res.status(500).json({
        error:
          error.message ||
          'No fue posible generar pago Flow.',
      });
    }
  }
);

app.post(
  '/api/flow/confirmation',
  async (req, res) => {
    try {
      const token = req.body.token;

      if (!token) {
        return res
          .status(400)
          .send('Token faltante');
      }

      const status =
        await callFlow(
          '/payment/getStatus',
          {
            token,
          }
        );

      if (
        status.status !== 2
      ) {
        return res.send('OK');
      }

      const { data: tickets, error } =
        await supabase
          .from('raffle_tickets')
          .select('*')
          .eq(
            'payment_id',
            token
          );

      if (error) throw error;

      const numbers =
        (tickets || []).map(
          (t) => t.number
        );

      if (!numbers.length) {
        return res.send('OK');
      }

      await supabase
        .from('raffle_tickets')
        .update({
          status: 'paid',
          reserved_until: null,
          payment_channel:
            'flow',
          notes:
            'Pagado vía Flow',
        })
        .eq(
          'raffle_id',
          RAFFLE_ID
        )
        .in('number', numbers);

      return res.send('OK');
    } catch (error) {
      console.error(error);

      return res
        .status(500)
        .send('ERROR');
    }
  }
);

app.get(
  '/api/flow/return',
  async (_req, res) => {
    return res.redirect(
      `${PUBLIC_FRONTEND_URL}?flow=success`
    );
  }
);

app.listen(PORT, async () => {
  await ensureRaffleNumbers(
    RAFFLE_SIZE
  );

  console.log(
    `Servidor iniciado en puerto ${PORT}`
  );
});
