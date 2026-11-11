import { escapeHtml } from '../../common/helpers/escape-html.helper';
import { buildAccountEmailHtml } from '../../common/services/email/account-email.layout';
import type { SendEmailOptions } from '../../common/services/email/email.service';
import { Order } from './entities/order.entity';

const orderUrl = (frontendUrl: string, orderId: string): string =>
  `${frontendUrl}/cuenta/pedidos/${orderId}`;

/**
 * Mismo bloque "cómo lo vas a recibir" para los 4 emails de este archivo - un solo lugar para no
 * repetir el markup (mismo criterio que `buildItemsListHtml` en `order-emails.ts`). El comprador
 * siempre ve la modalidad elegida y los datos relevantes de su entrega (ver tarea, punto 9).
 */
const buildDeliverySummaryHtml = (order: Order): string => {
  if (order.deliveryMethod === 'pickup' && order.pickupDetails) {
    return `
      <p style="font-family: Arial, Helvetica, sans-serif; font-size: 13.5px;">
        <strong>Modalidad:</strong> Retiro en el local<br />
        Retira: ${escapeHtml(order.pickupDetails.contactName)} · ${escapeHtml(order.pickupDetails.phone)}
      </p>
    `;
  }
  if (order.shippingAddress) {
    const a = order.shippingAddress;
    return `
      <p style="font-family: Arial, Helvetica, sans-serif; font-size: 13.5px;">
        <strong>Modalidad:</strong> Envío a domicilio<br />
        ${escapeHtml(a.recipientName)} · ${escapeHtml(a.phone)}<br />
        ${escapeHtml(a.street)} ${escapeHtml(a.streetNumber)}${a.apartment ? `, ${escapeHtml(a.apartment)}` : ''}<br />
        ${escapeHtml(a.city)}, ${escapeHtml(a.province)} (${escapeHtml(a.postalCode)})
      </p>
    `;
  }
  return '';
};

export function buildOrderInPreparationEmail(
  from: string,
  order: Order,
  frontendUrl: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'Tu pedido está en preparación - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Empezamos a preparar tu pedido.',
      heading: `Hola, ${escapeHtml(order.buyerName)}`,
      bodyHtml: `
        <p>Empezamos a preparar tu pedido.</p>
        ${buildDeliverySummaryHtml(order)}
      `,
      cta: { label: 'Ver mi pedido', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}

export function buildOrderReadyForPickupEmail(
  from: string,
  order: Order,
  frontendUrl: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'Tu pedido está listo para retirar - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Ya podés coordinar el retiro de tu pedido.',
      heading: `¡Listo, ${escapeHtml(order.buyerName)}!`,
      bodyHtml: `
        <p>Tu pedido ya está listo para retirar en el local. Te vamos a contactar para coordinar el
        día y el horario.</p>
        ${buildDeliverySummaryHtml(order)}
      `,
      cta: { label: 'Ver mi pedido', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}

export function buildOrderDispatchedEmail(
  from: string,
  order: Order,
  frontendUrl: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'Despachamos tu pedido - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Tu pedido ya está en camino.',
      heading: `Hola, ${escapeHtml(order.buyerName)}`,
      bodyHtml: `
        <p>Despachamos tu pedido - ya está en camino.</p>
        ${buildDeliverySummaryHtml(order)}
      `,
      cta: { label: 'Ver mi pedido', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}

export function buildOrderDeliveredEmail(
  from: string,
  order: Order,
  frontendUrl: string,
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'Tu pedido fue entregado - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: 'Confirmamos la entrega de tu pedido.',
      heading: `¡Gracias, ${escapeHtml(order.buyerName)}!`,
      bodyHtml: `
        <p>Confirmamos que tu pedido fue entregado. Esperamos que lo disfrutes.</p>
      `,
      cta: { label: 'Ver mi pedido', url: orderUrl(frontendUrl, order.id) },
    }),
  };
}
