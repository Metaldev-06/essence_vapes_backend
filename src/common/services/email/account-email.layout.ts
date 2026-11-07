/**
 * Wrapper HTML para los emails de cuenta (verificación, recuperación/cambio de contraseña) -
 * más elaborado que las plantillas mínimas de `contact.service.ts`/`withdrawal-requests.service.ts`
 * a propósito (el brief pide algo "profesional y responsive" específicamente para estos). Tabla +
 * estilos inline (no `<style>` en el `<head>`, varios clientes de correo lo ignoran), ancho fijo
 * de 480px centrado - el patrón estándar para que se vea bien tanto en desktop como en mobile.
 */

const BRAND_NAME = 'Essence Vapes';
const ACCENT_COLOR = '#8b5cf6';
const TEXT_COLOR = '#1f1b2e';
const MUTED_COLOR = '#6b6478';
const BORDER_COLOR = '#e7e3f0';

export interface AccountEmailOptions {
  /** Texto corto que algunos clientes de correo muestran como preview en la bandeja de entrada. */
  previewText: string;
  heading: string;
  /** HTML ya armado del cuerpo (párrafos) - el caller debe escapar cualquier dato de usuario. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Enlace alternativo en texto plano, mostrado debajo del botón - requisito del brief para el
   *  email de verificación (por si el botón no se puede clickear). */
  fallbackUrl?: string;
}

export function buildAccountEmailHtml(options: AccountEmailOptions): string {
  const { previewText, heading, bodyHtml, cta, fallbackUrl } = options;

  const ctaHtml = cta
    ? `
      <tr>
        <td style="padding: 8px 0 24px;">
          <a href="${cta.url}" target="_blank" rel="noopener"
            style="display: inline-block; padding: 14px 28px; background: ${ACCENT_COLOR}; color: #ffffff;
            font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700;
            text-decoration: none; border-radius: 10px;">
            ${cta.label}
          </a>
        </td>
      </tr>`
    : '';

  const fallbackHtml = fallbackUrl
    ? `
      <tr>
        <td style="padding: 0 0 24px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: ${MUTED_COLOR};">
          Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br>
          <a href="${fallbackUrl}" style="color: ${ACCENT_COLOR}; word-break: break-all;">${fallbackUrl}</a>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${BRAND_NAME}</title>
  </head>
  <body style="margin: 0; padding: 24px 16px; background: #f5f3fa;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${previewText}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
            style="max-width: 480px; width: 100%; background: #ffffff; border-radius: 16px;
            border: 1px solid ${BORDER_COLOR}; overflow: hidden;">
            <tr>
              <td style="padding: 28px 32px 0; font-family: Arial, Helvetica, sans-serif;">
                <span style="font-size: 18px; font-weight: 800; color: ${TEXT_COLOR};">${BRAND_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px 4px; font-family: Arial, Helvetica, sans-serif;
                font-size: 20px; font-weight: 800; color: ${TEXT_COLOR};">
                ${heading}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 32px 4px; font-family: Arial, Helvetica, sans-serif;
                font-size: 14.5px; line-height: 1.6; color: ${TEXT_COLOR};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0">${ctaHtml}</table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${fallbackHtml}</table>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px 28px; border-top: 1px solid ${BORDER_COLOR};
                font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: ${MUTED_COLOR};">
                Este es un mensaje automático de ${BRAND_NAME}. Si no reconocés esta actividad o
                no fuiste vos, podés ignorar este correo con tranquilidad - no se realizó ningún
                cambio en tu cuenta sin tu confirmación.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
