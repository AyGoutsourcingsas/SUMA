import { Handler } from '@netlify/functions';

// ============================================================
// SUMA ERP — Función Serverless: Enviar Correo con Resend
// ============================================================
// Permite enviar correos de actualización, alertas y notificaciones
// sin exponer la API Key de Resend en el frontend del cliente.
// ============================================================

const RESEND_API_URL = 'https://api.resend.com/emails';

export const handler: Handler = async (event) => {
  // Solo permitir método POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método no permitido. Use POST.' }),
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'RESEND_API_KEY no está configurada en las variables de entorno de Netlify.',
      }),
    };
  }

  try {
    const payload = JSON.parse(event.body ?? '{}');
    const { to, subject, html, text, from } = payload;

    if (!to || !subject || (!html && !text)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Faltan campos obligatorios: to, subject, y html/text son requeridos.',
        }),
      };
    }

    const defaultFrom = process.env.RESEND_FROM_EMAIL || 'SUMA SaaS <onboarding@resend.dev>';

    const recipients = Array.isArray(to) ? to : [to];

    const resendResponse = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || defaultFrom,
        to: recipients,
        subject,
        html: html || undefined,
        text: text || undefined,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return {
        statusCode: resendResponse.status,
        body: JSON.stringify({
          error: 'Error de la API de Resend',
          details: resendData,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        id: resendData.id,
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Error interno procesando envío de correo.',
      }),
    };
  }
};
