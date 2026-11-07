import { escapeHtml } from '../../common/helpers/escape-html.helper';
import { buildAccountEmailHtml } from '../../common/services/email/account-email.layout';
import type { SendEmailOptions } from '../../common/services/email/email.service';
import { User } from '../auth/entities/user.entity';

const SUPPORT_EMAIL = 'soporte@essencevapes.com.ar';

export function buildEmailVerificationEmail(
  from: string,
  user: User,
  token: string,
  frontendUrl: string,
): SendEmailOptions {
  const verifyUrl = `${frontendUrl}/auth/verificar-email?token=${encodeURIComponent(token)}`;

  return {
    from,
    to: user.email,
    subject: 'Confirmá tu correo - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Confirmá tu dirección de correo para activar tu cuenta.',
      heading: `¡Hola, ${escapeHtml(user.fullName)}!`,
      bodyHtml: `
        <p>Gracias por crear tu cuenta en Essence Vapes con <strong>${escapeHtml(user.email)}</strong>.</p>
        <p>Para activarla, confirmá que esta dirección es realmente tuya. El enlace vence en 24 horas.</p>
        <p>Si no creaste esta cuenta, podés ignorar este correo - nadie podrá usarlo sin acceso a tu casilla.</p>
      `,
      cta: { label: 'Verificar mi correo', url: verifyUrl },
      fallbackUrl: verifyUrl,
    }),
  };
}

export function buildPasswordResetCodeEmail(
  from: string,
  user: User,
  code: string,
): SendEmailOptions {
  return {
    from,
    to: user.email,
    subject: `${code} es tu código para recuperar tu contraseña - Essence Vapes`,
    html: buildAccountEmailHtml({
      previewText: `Tu código de recuperación es ${code}`,
      heading: 'Recuperá tu contraseña',
      bodyHtml: `
        <p>Recibimos una solicitud para restablecer la contraseña de <strong>${escapeHtml(user.email)}</strong>.</p>
        <p style="font-size: 28px; font-weight: 800; letter-spacing: 0.08em; text-align: center;
          padding: 12px 0; margin: 8px 0;">${code}</p>
        <p>Este código vence en 10 minutos y solo se puede usar una vez.</p>
        <p>Si no fuiste vos, ignorá este correo - tu contraseña actual sigue siendo válida y no se
        realizó ningún cambio en tu cuenta.</p>
      `,
    }),
  };
}

export function buildPasswordChangeCodeEmail(
  from: string,
  user: User,
  code: string,
): SendEmailOptions {
  return {
    from,
    to: user.email,
    subject: `${code} es tu código para cambiar tu contraseña - Essence Vapes`,
    html: buildAccountEmailHtml({
      previewText: `Tu código para cambiar tu contraseña es ${code}`,
      heading: 'Confirmá el cambio de contraseña',
      bodyHtml: `
        <p>Pediste cambiar la contraseña de tu cuenta <strong>${escapeHtml(user.email)}</strong> desde
        Configuración de cuenta.</p>
        <p style="font-size: 28px; font-weight: 800; letter-spacing: 0.08em; text-align: center;
          padding: 12px 0; margin: 8px 0;">${code}</p>
        <p>Este código vence en 10 minutos y solo se puede usar una vez.</p>
        <p>Si no fuiste vos, por favor escribinos a ${SUPPORT_EMAIL} - alguien más podría tener
        acceso a tu sesión.</p>
      `,
    }),
  };
}

export function buildPasswordChangedNoticeEmail(from: string, user: User): SendEmailOptions {
  return {
    from,
    to: user.email,
    subject: 'Tu contraseña cambió - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Tu contraseña se actualizó correctamente.',
      heading: 'Tu contraseña cambió',
      bodyHtml: `
        <p>La contraseña de tu cuenta <strong>${escapeHtml(user.email)}</strong> se actualizó
        correctamente. Por tu seguridad, cerramos cualquier otra sesión que estuviera abierta.</p>
        <p>Si no fuiste vos quien hizo este cambio, escribinos de inmediato a ${SUPPORT_EMAIL}
        para asegurar tu cuenta.</p>
      `,
    }),
  };
}
