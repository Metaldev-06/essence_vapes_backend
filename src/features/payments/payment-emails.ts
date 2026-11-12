import { escapeHtml } from '../../common/helpers/escape-html.helper';
import { buildAccountEmailHtml } from '../../common/services/email/account-email.layout';
import type { SendEmailOptions } from '../../common/services/email/email.service';
import { Order } from '../orders/entities/order.entity';
import { formatPrice } from '../products/helpers/format-price.helper';
import { statusDetailLabel } from './helpers/status-detail-label.helper';

const orderUrl = (frontendUrl: string, orderId: string) =>
  `${frontendUrl}/cuenta/pedidos/${orderId}`;

export function buildPaymentApprovedEmail(
  from: string,
  order: Order,
  frontendUrl: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: '¡Tu pago fue aprobado! - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: `Confirmamos tu pago de ${formatPrice(order.totalValue)}.`,
      heading: `¡Listo, ${escapeHtml(order.buyerName)}!`,
      bodyHtml: `
        <p>Tu pago de <strong>${formatPrice(order.totalValue)}</strong> se confirmó correctamente.
        Ya estamos preparando tu pedido.</p>
      `,
      cta: { label: 'Ver mi pedido', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}

export function buildPaymentRejectedEmail(
  from: string,
  order: Order,
  frontendUrl: string,
  statusDetail?: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'No pudimos procesar tu pago - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Tu pago no pudo procesarse - tu pedido sigue reservado.',
      heading: `Hola, ${escapeHtml(order.buyerName)}`,
      bodyHtml: `
        <p>No pudimos procesar el pago de tu pedido por <strong>${formatPrice(order.totalValue)}</strong>.
        ${statusDetailLabel(statusDetail) ? `${escapeHtml(statusDetailLabel(statusDetail)!)}` : ''}</p>
        <p>Tu pedido sigue reservado - podés reintentar el pago con otra tarjeta desde tu cuenta.</p>
      `,
      cta: { label: 'Reintentar pago', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}

export function buildPaymentPendingEmail(
  from: string,
  order: Order,
  frontendUrl: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'Tu pago está en revisión - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Tu pago está siendo revisado por Mercado Pago.',
      heading: `Hola, ${escapeHtml(order.buyerName)}`,
      bodyHtml: `
        <p>El pago de tu pedido por <strong>${formatPrice(order.totalValue)}</strong> está en revisión.
        No hace falta que hagas nada más - te avisamos en cuanto se resuelva.</p>
      `,
      cta: { label: 'Ver mi pedido', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}

export function buildRefundConfirmedEmail(
  from: string,
  order: Order,
  frontendUrl: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'Confirmamos tu reembolso - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: `Reembolsamos ${formatPrice(order.totalValue)} a tu medio de pago.`,
      heading: `Hola, ${escapeHtml(order.buyerName)}`,
      bodyHtml: `
        <p>Confirmamos el reembolso de <strong>${formatPrice(order.totalValue)}</strong> correspondiente
        a tu pedido. El acreditamiento a tu medio de pago depende de los tiempos de tu banco o tarjeta.</p>
      `,
      cta: { label: 'Ver mi pedido', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}
