import { escapeHtml } from '../../common/helpers/escape-html.helper';
import { buildAccountEmailHtml } from '../../common/services/email/account-email.layout';
import type { SendEmailOptions } from '../../common/services/email/email.service';
import { formatPrice } from '../products/helpers/format-price.helper';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';

/** Misma tabla de líneas para los 5 emails transaccionales de la orden (creada/aprobado/
 *  rechazado/pendiente/reembolsado) - un solo lugar para no repetir el markup 5 veces. */
const buildItemsListHtml = (items: OrderItem[]): string =>
  items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 4px 0; font-family: Arial, Helvetica, sans-serif; font-size: 13.5px;">
            ${item.quantity} x ${escapeHtml(item.productName)}${
              item.variantLabel ? ` (${escapeHtml(item.variantLabel)})` : ''
            }
          </td>
          <td style="padding: 4px 0; font-family: Arial, Helvetica, sans-serif; font-size: 13.5px;
            text-align: right; white-space: nowrap;">
            ${formatPrice(item.lineTotalValue)}
          </td>
        </tr>`,
    )
    .join('');

export function buildOrderCreatedEmail(
  from: string,
  order: Order,
  items: OrderItem[],
): SendEmailOptions {
  return {
    from,
    to: order.buyerEmail,
    subject: 'Recibimos tu pedido - Essence Vapes',
    html: buildAccountEmailHtml({
      previewText: `Registramos tu pedido por ${formatPrice(order.totalValue)}.`,
      heading: `¡Hola, ${escapeHtml(order.buyerName)}!`,
      bodyHtml: `
        <p>Registramos tu pedido. Te vamos a avisar por este mismo medio en cuanto se confirme el pago.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0;">
          ${buildItemsListHtml(items)}
          <tr>
            <td style="padding: 10px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 14.5px;
              font-weight: 800; border-top: 1px solid #e7e3f0;">Total</td>
            <td style="padding: 10px 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 14.5px;
              font-weight: 800; text-align: right; border-top: 1px solid #e7e3f0;">${formatPrice(order.totalValue)}</td>
          </tr>
        </table>
      `,
    }),
  };
}
