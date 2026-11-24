// ============================================================
// SUMA ERP — Servicio de Correos y Notificaciones (Resend)
// ============================================================

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface SendUpdateAlertOptions {
  to: string | string[];
  title: string;
  userName: string;
  moduleName: string;
  actionDescription: string;
  details?: Record<string, string | number>;
  actionUrl?: string;
}

/**
 * Envía un correo genérico a través de la Netlify Function con Resend.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string }> {
  try {
    const res = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn('Aviso al enviar correo:', data);
      return { success: false };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.warn('Error de red al enviar correo:', err);
    return { success: false };
  }
}

/**
 * Envía una notificación formateada con diseño corporativo SUMA
 * para alertar sobre actualizaciones importantes en módulos del sistema.
 */
export async function sendUpdateAlert(opts: SendUpdateAlertOptions): Promise<{ success: boolean; id?: string }> {
  const detailsHtml = opts.details
    ? `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #475569;">Detalles del cambio:</p>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155;">
          ${Object.entries(opts.details)
            .map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`)
            .join('')}
        </ul>
      </div>`
    : '';

  const actionBtnHtml = opts.actionUrl
    ? `<div style="text-align: center; margin: 24px 0;">
        <a href="${opts.actionUrl}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
          Ver en SUMA ERP
        </a>
      </div>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 24px 0; margin: 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <tr>
          <td style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">SUMA ERP</h1>
            <p style="color: #c7d2fe; margin: 4px 0 0 0; font-size: 12px;">Notificaciones del Sistema</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 24px;">
            <div style="display: inline-block; background-color: #e0e7ff; color: #4338ca; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 12px;">
              Módulo: ${opts.moduleName}
            </div>
            <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 17px; font-weight: 600;">${opts.title}</h2>
            <p style="color: #334155; font-size: 14px; line-height: 1.5; margin: 0 0 12px 0;">
              El usuario <strong>${opts.userName}</strong> ha realizado una actualización:
            </p>
            <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0; background: #f8fafc; border-left: 3px solid #4f46e5; padding: 8px 12px;">
              ${opts.actionDescription}
            </p>

            ${detailsHtml}
            ${actionBtnHtml}

            <p style="color: #94a3b8; font-size: 11px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; text-align: center;">
              Mensaje automático enviado por SUMA SaaS. Fecha: ${new Date().toLocaleString('es-CO')}
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendEmail({
    to: opts.to,
    subject: `[SUMA - ${opts.moduleName}] ${opts.title}`,
    html,
  });
}
