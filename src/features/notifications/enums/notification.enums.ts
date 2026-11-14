/** Agrupa los tipos de evento para filtros, iconos y preferencias del panel. */
export enum NotificationCategory {
  ORDERS = 'orders',
  INVENTORY = 'inventory',
  PAYMENTS = 'payments',
  CUSTOMERS = 'customers',
  SECURITY = 'security',
  SYSTEM = 'system',
}

/** `CRITICAL` nunca se silencia: ignora el horario de silencio y siempre queda en el panel. */
export enum NotificationPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

/**
 * Catálogo cerrado de eventos que pueden generar una notificación administrativa. Agregar un
 * tipo nuevo exige completar su entrada en `notification-catalog.ts` (el `Record` de ahí es
 * exhaustivo, así que el compilador lo reclama).
 */
export enum NotificationType {
  ORDER_PAID = 'order.paid',
  ORDER_PENDING_PREPARATION = 'order.pending_preparation',
  ORDER_PENDING_DISPATCH = 'order.pending_dispatch',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_NEEDS_ATTENTION = 'order.needs_attention',
  ORDER_READY_FOR_PICKUP = 'order.ready_for_pickup',

  STOCK_LOW = 'stock.low',
  STOCK_OUT = 'stock.out',
  STOCK_BACK = 'stock.back',
  STOCK_REORDER = 'stock.reorder',

  PAYMENT_REFUNDED = 'payment.refunded',
  PAYMENT_CHARGED_BACK = 'payment.charged_back',
  PAYMENT_PROCESSING_ERROR = 'payment.processing_error',
  PAYMENT_MISMATCH = 'payment.mismatch',
  PAYMENT_WEBHOOK_UNPROCESSED = 'payment.webhook_unprocessed',

  CUSTOMER_NEW_MESSAGE = 'customer.new_message',
  CUSTOMER_WITHDRAWAL_REQUEST = 'customer.withdrawal_request',
  CUSTOMER_UNANSWERED = 'customer.unanswered',

  SECURITY_ADMIN_LOCKOUT = 'security.admin_lockout',
  SECURITY_IP_BLOCKED = 'security.ip_blocked',

  SYSTEM_EMAIL_FAILED = 'system.email_failed',
  SYSTEM_JOB_FAILED = 'system.job_failed',
  SYSTEM_ERROR = 'system.error',
}

export enum DeliveryChannel {
  PUSH = 'push',
  EMAIL = 'email',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  /** No se envió a propósito (horario de silencio, canal no configurado, sin dispositivos). */
  SKIPPED = 'skipped',
}

export enum StockAlertState {
  OK = 'ok',
  LOW = 'low',
  OUT = 'out',
}

export enum DigestFrequency {
  OFF = 'off',
  DAILY = 'daily',
  WEEKLY = 'weekly',
}
