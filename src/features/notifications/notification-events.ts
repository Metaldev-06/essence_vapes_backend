import { formatPrice } from '../products/helpers/format-price.helper';
import { NotificationType } from './enums/notification.enums';
import { formatArgentinaDateTime } from './helpers/quiet-hours.helper';
import { shortOrderId } from './helpers/notification-text.helper';

/**
 * Un evento de negocio listo para publicarse. `dedupeKey` identifica el hecho lógico (no el
 * intento de publicarlo): publicar dos veces el mismo `dedupeKey` deja una sola notificación
 * por admin.
 *
 * Regla para todo builder de este archivo: NUNCA incluir nombre, email, teléfono ni dirección
 * del cliente en `title`/`body` - el mismo texto viaja por Web Push. El detalle completo se ve
 * al entrar al recurso (`resourceUrl`), ya dentro del panel autenticado.
 */
export interface NotificationEvent {
  readonly type: NotificationType;
  readonly dedupeKey: string;
  readonly title: string;
  readonly body: string;
  readonly resourceUrl?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly metadata?: Record<string, string | number | boolean | null>;
  /** El admin que causó el evento con su propia acción no necesita que se lo avisen. */
  readonly excludeAdminId?: string;
}

/** Lo mínimo que estos builders necesitan de una orden - evita acoplar este archivo a la entidad
 *  completa (y facilita los tests). */
export interface OrderLike {
  readonly id: string;
  readonly totalValue: number;
  readonly deliveryMethod: string;
  readonly paidAt?: Date | null;
  readonly createdAt?: Date;
}

const deliveryLabel = (deliveryMethod: string): string =>
  deliveryMethod === 'pickup' ? 'Retiro en el local' : 'Envío a domicilio';

const orderUrl = (orderId: string): string => `/admin/ventas/${orderId}`;

const orderResource = (order: OrderLike) => ({
  resourceUrl: orderUrl(order.id),
  resourceType: 'order',
  resourceId: order.id,
});

export const orderPaidEvent = (order: OrderLike): NotificationEvent => ({
  type: NotificationType.ORDER_PAID,
  dedupeKey: `order.paid:${order.id}`,
  title: `Nuevo pedido pagado #${shortOrderId(order.id)}`,
  body: `${formatPrice(order.totalValue)} · ${deliveryLabel(order.deliveryMethod)} · ${formatArgentinaDateTime(
    order.paidAt ?? new Date(),
  )}`,
  ...orderResource(order),
  metadata: { amount: order.totalValue, deliveryMethod: order.deliveryMethod },
});

export const orderCancelledEvent = (order: OrderLike): NotificationEvent => ({
  type: NotificationType.ORDER_CANCELLED,
  dedupeKey: `order.cancelled:${order.id}`,
  title: `Pedido cancelado #${shortOrderId(order.id)}`,
  body: `Mercado Pago canceló el pago de ${formatPrice(order.totalValue)}. El pedido no debe prepararse.`,
  ...orderResource(order),
});

export const paymentRefundedEvent = (order: OrderLike): NotificationEvent => ({
  type: NotificationType.PAYMENT_REFUNDED,
  dedupeKey: `payment.refunded:${order.id}`,
  title: `Reembolso realizado · pedido #${shortOrderId(order.id)}`,
  body: `Se reembolsaron ${formatPrice(order.totalValue)} al comprador.`,
  ...orderResource(order),
  metadata: { amount: order.totalValue },
});

export const paymentChargedBackEvent = (order: OrderLike): NotificationEvent => ({
  type: NotificationType.PAYMENT_CHARGED_BACK,
  dedupeKey: `payment.charged_back:${order.id}`,
  title: `Contracargo · pedido #${shortOrderId(order.id)}`,
  body: `El titular de la tarjeta desconoció un pago de ${formatPrice(
    order.totalValue,
  )}. Revisá el caso en Mercado Pago para presentar la documentación.`,
  ...orderResource(order),
  metadata: { amount: order.totalValue },
});

export const paymentMismatchEvent = (
  order: OrderLike,
  reason: 'amount' | 'paid_after_release',
  detail: string,
): NotificationEvent => ({
  type: NotificationType.PAYMENT_MISMATCH,
  dedupeKey: `payment.mismatch:${reason}:${order.id}`,
  title: `Inconsistencia de pago · pedido #${shortOrderId(order.id)}`,
  body: detail,
  ...orderResource(order),
});

export const paymentWebhookUnprocessedEvent = (
  resourceId: string,
  reason: string,
): NotificationEvent => ({
  type: NotificationType.PAYMENT_WEBHOOK_UNPROCESSED,
  // Un aviso por recurso de Mercado Pago: los reintentos del mismo webhook no se acumulan.
  dedupeKey: `payment.webhook_unprocessed:${resourceId}`,
  title: 'Aviso de Mercado Pago sin procesar',
  body: `No se pudo procesar la notificación de la operación ${resourceId}. ${reason}`,
  resourceUrl: '/admin/transacciones',
  resourceType: 'mp_order',
  resourceId,
});

export const paymentProcessingErrorEvent = (order: OrderLike, reason: string): NotificationEvent => ({
  type: NotificationType.PAYMENT_PROCESSING_ERROR,
  dedupeKey: `payment.processing_error:${order.id}`,
  title: `Error al registrar un pago · pedido #${shortOrderId(order.id)}`,
  body: reason,
  ...orderResource(order),
});

export const orderReadyForPickupEvent = (order: OrderLike, actorId?: string): NotificationEvent => ({
  type: NotificationType.ORDER_READY_FOR_PICKUP,
  dedupeKey: `order.ready_for_pickup:${order.id}`,
  title: `Pedido listo para retiro #${shortOrderId(order.id)}`,
  body: 'El pedido ya puede retirarse en el local.',
  ...orderResource(order),
  excludeAdminId: actorId,
});

export const orderDeliveryIssueEvent = (order: OrderLike, actorId?: string): NotificationEvent => ({
  type: NotificationType.ORDER_NEEDS_ATTENTION,
  // Incluye el día: si el mismo pedido vuelve a tener un problema más adelante, se avisa de nuevo.
  dedupeKey: `order.delivery_issue:${order.id}:${new Date().toISOString().slice(0, 10)}`,
  title: `Problema de entrega · pedido #${shortOrderId(order.id)}`,
  body: 'El pedido quedó marcado con un problema de entrega y necesita seguimiento.',
  ...orderResource(order),
  excludeAdminId: actorId,
});

export const orderPendingPreparationEvent = (order: OrderLike, hours: number): NotificationEvent => ({
  type: NotificationType.ORDER_PENDING_PREPARATION,
  dedupeKey: `order.pending_preparation:${order.id}`,
  title: `Pedido sin preparar #${shortOrderId(order.id)}`,
  body: `Está pagado hace más de ${hours} h y sigue pendiente de preparación.`,
  ...orderResource(order),
});

export const orderPendingDispatchEvent = (order: OrderLike, hours: number): NotificationEvent => ({
  type: NotificationType.ORDER_PENDING_DISPATCH,
  dedupeKey: `order.pending_dispatch:${order.id}`,
  title: `Pedido demorado #${shortOrderId(order.id)}`,
  body:
    order.deliveryMethod === 'pickup'
      ? `Está pagado hace más de ${hours} h y todavía no quedó listo para retiro.`
      : `Está pagado hace más de ${hours} h y todavía no fue despachado.`,
  ...orderResource(order),
});

export interface StockSubject {
  readonly productId: string;
  readonly variantId: string;
  /** Nombre del producto (más la variante si aplica) - dato del catálogo, no del cliente. */
  readonly label: string;
  readonly stock: number;
  readonly episode: number;
}

const productUrl = (productId: string): string => `/admin/productos/${productId}/editar`;

const stockResource = (subject: StockSubject) => ({
  resourceUrl: productUrl(subject.productId),
  resourceType: 'product',
  resourceId: subject.productId,
  metadata: { variantId: subject.variantId, stock: subject.stock },
});

const stockKey = (subject: StockSubject): string =>
  `${subject.productId}:${subject.variantId}:${subject.episode}`;

export const stockLowEvent = (subject: StockSubject, threshold: number): NotificationEvent => ({
  type: NotificationType.STOCK_LOW,
  dedupeKey: `stock.low:${stockKey(subject)}`,
  title: `Stock bajo: ${subject.label}`,
  body: `Quedan ${subject.stock} ${subject.stock === 1 ? 'unidad' : 'unidades'} (umbral: ${threshold}).`,
  ...stockResource(subject),
});

export const stockOutEvent = (subject: StockSubject): NotificationEvent => ({
  type: NotificationType.STOCK_OUT,
  dedupeKey: `stock.out:${stockKey(subject)}`,
  title: `Sin stock: ${subject.label}`,
  body: 'El producto llegó a cero unidades y ya no puede comprarse.',
  ...stockResource(subject),
});

export const stockBackEvent = (subject: StockSubject): NotificationEvent => ({
  type: NotificationType.STOCK_BACK,
  dedupeKey: `stock.back:${stockKey(subject)}`,
  title: `Volvió a tener stock: ${subject.label}`,
  body: `Ahora hay ${subject.stock} ${subject.stock === 1 ? 'unidad disponible' : 'unidades disponibles'}.`,
  ...stockResource(subject),
});

export const stockReorderEvent = (subject: StockSubject, days: number): NotificationEvent => ({
  type: NotificationType.STOCK_REORDER,
  dedupeKey: `stock.reorder:${stockKey(subject)}`,
  title: `Requiere reposición: ${subject.label}`,
  body: `Lleva más de ${days} ${days === 1 ? 'día' : 'días'} sin stock.`,
  ...stockResource(subject),
});

const INBOX_LABELS: Record<string, string> = {
  contacto: 'Contacto',
  ventas: 'Ventas',
  soporte: 'Soporte',
};

export const newMessageEvent = (inbox: string, threadId: string): NotificationEvent => ({
  type: NotificationType.CUSTOMER_NEW_MESSAGE,
  // Un aviso por conversación mientras siga sin leerse en el panel de notificaciones del día -
  // varios correos seguidos del mismo hilo no generan una notificación cada uno.
  dedupeKey: `customer.new_message:${threadId}:${new Date().toISOString().slice(0, 13)}`,
  title: 'Nuevo mensaje recibido',
  body: `Entró un correo en la bandeja ${INBOX_LABELS[inbox] ?? inbox}.`,
  resourceUrl: '/admin/mensajes',
  resourceType: 'message_thread',
  resourceId: threadId,
});

export const withdrawalRequestEvent = (requestId: string, trackingCode: string): NotificationEvent => ({
  type: NotificationType.CUSTOMER_WITHDRAWAL_REQUEST,
  dedupeKey: `customer.withdrawal_request:${requestId}`,
  title: 'Nueva solicitud de arrepentimiento',
  body: `Trámite ${trackingCode}. Tiene plazo legal de respuesta.`,
  resourceUrl: '/admin/arrepentimientos',
  resourceType: 'withdrawal_request',
  resourceId: requestId,
});

export const unansweredWithdrawalEvent = (
  requestId: string,
  trackingCode: string,
  hours: number,
): NotificationEvent => ({
  type: NotificationType.CUSTOMER_UNANSWERED,
  dedupeKey: `customer.unanswered:withdrawal:${requestId}`,
  title: 'Arrepentimiento sin atender',
  body: `El trámite ${trackingCode} lleva más de ${hours} h sin revisión.`,
  resourceUrl: '/admin/arrepentimientos',
  resourceType: 'withdrawal_request',
  resourceId: requestId,
});

export const unansweredMessageEvent = (threadId: string, inbox: string, hours: number): NotificationEvent => ({
  type: NotificationType.CUSTOMER_UNANSWERED,
  dedupeKey: `customer.unanswered:thread:${threadId}`,
  title: 'Consulta sin responder',
  body: `Un mensaje de la bandeja ${INBOX_LABELS[inbox] ?? inbox} lleva más de ${hours} h sin respuesta.`,
  resourceUrl: '/admin/mensajes',
  resourceType: 'message_thread',
  resourceId: threadId,
});

export const adminLockoutEvent = (minutes: number): NotificationEvent => ({
  type: NotificationType.SECURITY_ADMIN_LOCKOUT,
  // Una alerta por hora como máximo: un ataque sostenido no genera una por cada bloqueo.
  dedupeKey: `security.admin_lockout:${new Date().toISOString().slice(0, 13)}`,
  title: 'Intentos sospechosos de acceso al panel',
  body: `Una cuenta de administrador fue bloqueada ${minutes} min por intentos de ingreso fallidos. Si no fuiste vos, cambiá la contraseña.`,
});

export const ipBlockedEvent = (ip: string, reason: string): NotificationEvent => ({
  type: NotificationType.SECURITY_IP_BLOCKED,
  dedupeKey: `security.ip_blocked:${ip}:${new Date().toISOString().slice(0, 10)}`,
  title: 'IP bloqueada temporalmente',
  body: `${reason} (${ip}).`,
});

export const emailFailedEvent = (subject: string): NotificationEvent => ({
  type: NotificationType.SYSTEM_EMAIL_FAILED,
  dedupeKey: `system.email_failed:${new Date().toISOString().slice(0, 13)}`,
  title: 'Un correo del sistema no pudo enviarse',
  body: `Falló el envío de "${subject}". Revisá la configuración de Resend si se repite.`,
});

export const jobFailedEvent = (jobName: string, reason: string): NotificationEvent => ({
  type: NotificationType.SYSTEM_JOB_FAILED,
  dedupeKey: `system.job_failed:${jobName}:${new Date().toISOString().slice(0, 13)}`,
  title: `Falló un proceso automático: ${jobName}`,
  body: reason,
});
