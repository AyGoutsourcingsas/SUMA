import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyWompiSignature(
  body: string,
  checksum: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return hash === checksum;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  const body = event.body ?? '';
  const checksum = event.headers['x-event-checksum'] ?? '';
  const secret = process.env.WOMPI_EVENTS_SECRET ?? '';

  if (!verifyWompiSignature(body, checksum, secret)) {
    return { statusCode: 401, body: 'Firma inválida' };
  }

  let payload: {
    event: string;
    data: { transaction: { reference: string; status: string } };
  };

  try {
    payload = JSON.parse(body);
  } catch {
    return { statusCode: 400, body: 'Body inválido' };
  }

  const { event: eventType, data } = payload;
  const { reference, status } = data.transaction;

  if (eventType === 'transaction.updated') {
    const paymentStatus =
      status === 'APPROVED'
        ? 'aprobado'
        : status === 'DECLINED'
        ? 'rechazado'
        : 'pendiente';

    const appStatus =
      status === 'APPROVED' ? 'pago_recibido' : 'pago_pendiente';

    await supabase
      .from('applications')
      .update({
        payment_status: paymentStatus,
        status: appStatus,
        history: supabase.rpc('jsonb_append', {
          arr: 'history',
          val: { timestamp: new Date().toISOString(), event: `Wompi: ${status}` },
        }),
      })
      .eq('id', reference);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
