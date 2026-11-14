import { escapeHtml } from '../../common/helpers/escape-html.helper';
import { buildAccountEmailHtml } from '../../common/services/email/account-email.layout';
import type { SendEmailOptions } from '../../common/services/email/email.service';
import { formatPrice } from '../products/helpers/format-price.helper';
import { NotificationPriority, NotificationType } from './enums/notification.enums';
import { shortOrderId } from './helpers/notification-text.helper';

/**
 * Correos de alerta para administradores - mismo layout de marca que el resto de los emails del
 * proyecto (`buildAccountEmailHtml`). Todos van con `internal: true`: si fallan, `EmailService`
 * no lo reporta como evento (evita el loop "falló el aviso de que falló un correo"); el reintento
 * lo maneja `NotificationDeliveryWorker`.
 *
 * Todo dato variable pasa por `escapeHtml` antes de interpolarse.
 */

const FONT = 'font-family: Arial, Helvetica, sans-serif;';
const paragraph = (html: string): string =>
  `<p style="${FONT} font-size: 15px; line-height: 1.55; margin: 0 0 14px;">${html}</p>`;
const muted = (html: string): string =>
  `<p style="${FONT} font-size: 13px; line-height: 1.5; margin: 0 0 14px; color: #6b6478;">${html}</p>`;

const detailRows = (rows: ReadonlyArray<readonly [string, string]>): string => `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
    style="border-collapse: collapse; margin: 4px 0 18px;">
    ${rows
      .map(
        ([label, value]) => `
      <tr>
        <td style="${FONT} font-size: 13px; color: #6b6478; padding: 7px 0; border-bottom: 1px solid #e7e3f0;">
          ${escapeHtml(label)}
        </td>
        <td style="${FONT} font-size: 14px; font-weight: 700; padding: 7px 0; border-bottom: 1px solid #e7e3f0;
          text-align: right;">
          ${escapeHtml(value)}
        </td>
      </tr>`,
      )
      .join('')}
  </table>`;

const priorityBanner = (priority: string): string =>
  priority === NotificationPriority.CRITICAL
    ? `<p style="${FONT} font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
        color: #b91c1c; margin: 0 0 10px;">Requiere atención inmediata</p>`
    : '';

export interface AlertEmailNotification {
  readonly type: NotificationType;
  readonly priority: string;
  readonly title: string;
  readonly body: string;
  readonly resourceUrl: string | null;
}

/** Líneas del pedido para el correo de "nuevo pedido pagado" - datos del catálogo y del pedido,
 *  sin nombre, email, teléfono ni dirección del comprador (eso se consulta dentro del panel). */
export interface AlertEmailOrderContext {
  readonly orderId: string;
  readonly totalValue: number;
  readonly deliveryMethod: string;
  readonly paidAtLabel: string;
  readonly items: ReadonlyArray<{
    readonly productName: string;
    readonly variantLabel?: string | null;
    readonly quantity: number;
    readonly lineTotalValue: number;
  }>;
}

const CTA_LABELS: Partial<Record<NotificationType, string>> = {
  [NotificationType.ORDER_PAID]: 'Ver el pedido',
  [NotificationType.STOCK_OUT]: 'Reponer stock',
  [NotificationType.PAYMENT_REFUNDED]: 'Ver el pedido',
  [NotificationType.PAYMENT_CHARGED_BACK]: 'Ver el pedido',
  [NotificationType.PAYMENT_MISMATCH]: 'Revisar el pedido',
};

function orderPaidBody(order: AlertEmailOrderContext): string {
  const items = order.items
    .map(
      (item) => `
      <tr>
        <td style="${FONT} font-size: 13.5px; padding: 5px 0;">
          ${item.quantity} x ${escapeHtml(item.productName)}${
            item.variantLabel ? ` (${escapeHtml(item.variantLabel)})` : ''
          }
        </td>
        <td style="${FONT} font-size: 13.5px; padding: 5px 0; text-align: right; white-space: nowrap;">
          ${formatPrice(item.lineTotalValue)}
        </td>
      </tr>`,
    )
    .join('');

  return (
    paragraph('Mercado Pago confirmó el pago de un pedido nuevo. Ya podés prepararlo.') +
    detailRows([
      ['Pedido', `#${shortOrderId(order.orderId)}`],
      ['Importe', formatPrice(order.totalValue)],
      ['Entrega', order.deliveryMethod === 'pickup' ? 'Retiro en el local' : 'Envío a domicilio'],
      ['Pago confirmado', order.paidAtLabel],
    ]) +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 18px;">${items}</table>` +
    muted('Los datos del comprador y de entrega están en el detalle del pedido, dentro del panel.')
  );
}

const GUIDANCE: Partial<Record<NotificationType, string>> = {
  [NotificationType.STOCK_OUT]:
    'Mientras no tenga unidades, el producto no puede comprarse en la tienda. Cargá el stock nuevo desde su ficha.',
  [NotificationType.PAYMENT_REFUNDED]:
    'Si el pedido todavía no se despachó, no lo prepares. Si ya salió, coordiná la devolución con el comprador.',
  [NotificationType.PAYMENT_CHARGED_BACK]:
    'Mercado Pago da un plazo acotado para responder un contracargo. Entrá a tu cuenta de Mercado Pago, abrí el caso y adjuntá el comprobante de entrega.',
  [NotificationType.PAYMENT_MISMATCH]:
    'No prepares ni despaches el pedido hasta confirmar el estado real con el botón "Conciliar" de su detalle.',
};

export function buildAdminAlertEmail(options: {
  from: string;
  to: string;
  frontendUrl: string;
  notification: AlertEmailNotification;
  order?: AlertEmailOrderContext | null;
}): SendEmailOptions {
  const { from, to, frontendUrl, notification, order } = options;
  const base = frontendUrl.replace(/\/+$/, '');
  const targetUrl = `${base}${notification.resourceUrl ?? '/admin/notificaciones'}`;

  const bodyHtml =
    priorityBanner(notification.priority) +
    (notification.type === NotificationType.ORDER_PAID && order
      ? orderPaidBody(order)
      : paragraph(escapeHtml(notification.body)) +
        (GUIDANCE[notification.type] ? muted(escapeHtml(GUIDANCE[notification.type]!)) : '')) +
    muted(
      `Recibís este correo porque tenés activadas las alertas por email para este evento. Podés cambiarlo en
       <a href="${base}/admin/notificaciones/configuracion" style="color: #8b5cf6;">Configuración de notificaciones</a>.`,
    );

  return {
    from,
    to,
    subject: `${notification.priority === NotificationPriority.CRITICAL ? '[Urgente] ' : ''}${notification.title} - Essence Vapes`,
    html: buildAccountEmailHtml({
      previewText: escapeHtml(notification.body),
      heading: escapeHtml(notification.title),
      bodyHtml,
      cta: { label: CTA_LABELS[notification.type] ?? 'Abrir en el panel', url: targetUrl },
    }),
    internal: true,
  };
}

export interface DigestData {
  /** "ayer" / "los últimos 7 días". */
  readonly periodLabel: string;
  readonly paidOrders: number;
  readonly revenueValue: number;
  readonly pendingPreparation: number;
  readonly pendingDispatch: number;
  readonly outOfStock: number;
  readonly lowStock: number;
  readonly openWithdrawals: number;
  readonly unreadNotifications: number;
  /** Avisos críticos o de prioridad alta del período, ya saneados. */
  readonly highlights: ReadonlyArray<{ readonly title: string; readonly body: string }>;
}

export function buildDigestEmail(options: {
  from: string;
  to: string;
  frontendUrl: string;
  adminName: string;
  data: DigestData;
}): SendEmailOptions {
  const { from, to, frontendUrl, adminName, data } = options;
  const base = frontendUrl.replace(/\/+$/, '');

  const highlights =
    data.highlights.length > 0
      ? `<p style="${FONT} font-size: 13px; font-weight: 700; margin: 6px 0 8px;">Para revisar</p>` +
        data.highlights
          .map(
            (highlight) => `
          <p style="${FONT} font-size: 13.5px; line-height: 1.45; margin: 0 0 10px; padding-left: 10px;
            border-left: 3px solid #8b5cf6;">
            <strong>${escapeHtml(highlight.title)}</strong><br>
            <span style="color: #6b6478;">${escapeHtml(highlight.body)}</span>
          </p>`,
          )
          .join('')
      : muted('No hubo alertas importantes en este período.');

  const bodyHtml =
    paragraph(`Este es el resumen de ${escapeHtml(data.periodLabel)}.`) +
    detailRows([
      ['Pedidos pagados', String(data.paidOrders)],
      ['Ventas cobradas', formatPrice(data.revenueValue)],
      ['Pagados sin preparar', String(data.pendingPreparation)],
      ['Pendientes de despacho o retiro', String(data.pendingDispatch)],
      ['Productos sin stock', String(data.outOfStock)],
      ['Productos con stock bajo', String(data.lowStock)],
      ['Arrepentimientos sin atender', String(data.openWithdrawals)],
      ['Notificaciones sin leer', String(data.unreadNotifications)],
    ]) +
    highlights +
    muted(
      `Podés cambiar la frecuencia de este resumen en
       <a href="${base}/admin/notificaciones/configuracion" style="color: #8b5cf6;">Configuración de notificaciones</a>.`,
    );

  return {
    from,
    to,
    subject: `Resumen del negocio: ${data.paidOrders} ${data.paidOrders === 1 ? 'pedido' : 'pedidos'} · ${formatPrice(
      data.revenueValue,
    )} - Essence Vapes`,
    html: buildAccountEmailHtml({
      previewText: `${data.paidOrders} pedidos pagados por ${formatPrice(data.revenueValue)} en ${data.periodLabel}.`,
      heading: `Hola, ${escapeHtml(adminName)}`,
      bodyHtml,
      cta: { label: 'Abrir el panel', url: `${base}/admin` },
    }),
    internal: true,
  };
}
