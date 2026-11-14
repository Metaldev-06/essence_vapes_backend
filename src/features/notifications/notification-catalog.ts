import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from './enums/notification.enums';

export interface ChannelSet {
  readonly inApp: boolean;
  readonly push: boolean;
  readonly email: boolean;
}

export interface NotificationDefinition {
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  /** Texto para la pantalla de configuración. */
  readonly label: string;
  readonly description: string;
  /** Canales cuando el admin todavía no configuró nada para este evento. */
  readonly defaults: ChannelSet;
  /** Máximo de notificaciones de este tipo por admin dentro de `SPAM_WINDOW_MS` - el resto se
   *  descarta (y se loguea) en vez de inundar el panel si algo entra en loop. */
  readonly maxPerWindow: number;
}

export const SPAM_WINDOW_MS = 10 * 60_000;

const PANEL_ONLY: ChannelSet = { inApp: true, push: false, email: false };
const PANEL_PUSH: ChannelSet = { inApp: true, push: true, email: false };
const ALL_CHANNELS: ChannelSet = { inApp: true, push: true, email: true };

/**
 * Única fuente de verdad sobre cada tipo de evento. `Record<NotificationType, ...>` es
 * exhaustivo: agregar un valor al enum sin definirlo acá no compila.
 */
export const NOTIFICATION_CATALOG: Record<NotificationType, NotificationDefinition> = {
  [NotificationType.ORDER_PAID]: {
    category: NotificationCategory.ORDERS,
    priority: NotificationPriority.HIGH,
    label: 'Nuevo pedido pagado',
    description: 'Un pedido cuyo pago fue confirmado por Mercado Pago.',
    defaults: ALL_CHANNELS,
    maxPerWindow: 60,
  },
  [NotificationType.ORDER_PENDING_PREPARATION]: {
    category: NotificationCategory.ORDERS,
    priority: NotificationPriority.NORMAL,
    label: 'Pedido pagado sin preparar',
    description: 'Un pedido pagado sigue pendiente de preparación pasado el plazo configurado.',
    defaults: PANEL_PUSH,
    maxPerWindow: 30,
  },
  [NotificationType.ORDER_PENDING_DISPATCH]: {
    category: NotificationCategory.ORDERS,
    priority: NotificationPriority.HIGH,
    label: 'Pedido demorado sin despachar',
    description: 'Un pedido pagado no fue despachado ni quedó listo para retiro dentro del plazo.',
    defaults: PANEL_PUSH,
    maxPerWindow: 30,
  },
  [NotificationType.ORDER_CANCELLED]: {
    category: NotificationCategory.ORDERS,
    priority: NotificationPriority.NORMAL,
    label: 'Pedido cancelado',
    description: 'Mercado Pago canceló el pago de un pedido.',
    defaults: PANEL_ONLY,
    maxPerWindow: 30,
  },
  [NotificationType.ORDER_NEEDS_ATTENTION]: {
    category: NotificationCategory.ORDERS,
    priority: NotificationPriority.HIGH,
    label: 'Pedido con problemas',
    description: 'Un pedido quedó marcado con un problema de entrega y necesita intervención.',
    defaults: PANEL_PUSH,
    maxPerWindow: 30,
  },
  [NotificationType.ORDER_READY_FOR_PICKUP]: {
    category: NotificationCategory.ORDERS,
    priority: NotificationPriority.LOW,
    label: 'Pedido listo para retiro',
    description: 'Otro administrador marcó un pedido como listo para retirar en el local.',
    defaults: PANEL_ONLY,
    maxPerWindow: 30,
  },

  [NotificationType.STOCK_LOW]: {
    category: NotificationCategory.INVENTORY,
    priority: NotificationPriority.NORMAL,
    label: 'Stock bajo',
    description: 'Un producto alcanzó su umbral de stock bajo.',
    defaults: PANEL_ONLY,
    maxPerWindow: 40,
  },
  [NotificationType.STOCK_OUT]: {
    category: NotificationCategory.INVENTORY,
    priority: NotificationPriority.HIGH,
    label: 'Producto sin stock',
    description: 'Un producto llegó a cero unidades.',
    defaults: ALL_CHANNELS,
    maxPerWindow: 40,
  },
  [NotificationType.STOCK_BACK]: {
    category: NotificationCategory.INVENTORY,
    priority: NotificationPriority.LOW,
    label: 'Producto con stock otra vez',
    description: 'Un producto que estaba agotado volvió a tener unidades.',
    defaults: PANEL_ONLY,
    maxPerWindow: 40,
  },
  [NotificationType.STOCK_REORDER]: {
    category: NotificationCategory.INVENTORY,
    priority: NotificationPriority.NORMAL,
    label: 'Producto requiere reposición',
    description: 'Un producto lleva varios días agotado.',
    defaults: PANEL_ONLY,
    maxPerWindow: 40,
  },

  [NotificationType.PAYMENT_REFUNDED]: {
    category: NotificationCategory.PAYMENTS,
    priority: NotificationPriority.HIGH,
    label: 'Reembolso realizado',
    description: 'Mercado Pago informó el reembolso de un pago.',
    defaults: ALL_CHANNELS,
    maxPerWindow: 30,
  },
  [NotificationType.PAYMENT_CHARGED_BACK]: {
    category: NotificationCategory.PAYMENTS,
    priority: NotificationPriority.CRITICAL,
    label: 'Contracargo o disputa',
    description: 'Un pago ya cobrado fue desconocido por el titular de la tarjeta.',
    defaults: ALL_CHANNELS,
    maxPerWindow: 30,
  },
  [NotificationType.PAYMENT_PROCESSING_ERROR]: {
    category: NotificationCategory.PAYMENTS,
    priority: NotificationPriority.HIGH,
    label: 'Error al procesar un pago',
    description: 'Un pago no pudo registrarse correctamente y requiere revisión manual.',
    defaults: PANEL_PUSH,
    maxPerWindow: 10,
  },
  [NotificationType.PAYMENT_MISMATCH]: {
    category: NotificationCategory.PAYMENTS,
    priority: NotificationPriority.CRITICAL,
    label: 'Inconsistencia entre pedido y pago',
    description: 'El estado o el importe del pago no coincide con el del pedido.',
    defaults: ALL_CHANNELS,
    maxPerWindow: 20,
  },
  [NotificationType.PAYMENT_WEBHOOK_UNPROCESSED]: {
    category: NotificationCategory.PAYMENTS,
    priority: NotificationPriority.HIGH,
    label: 'Aviso de Mercado Pago sin procesar',
    description: 'Llegó una notificación de Mercado Pago que no pudo procesarse.',
    defaults: PANEL_PUSH,
    maxPerWindow: 10,
  },

  [NotificationType.CUSTOMER_NEW_MESSAGE]: {
    category: NotificationCategory.CUSTOMERS,
    priority: NotificationPriority.NORMAL,
    label: 'Nuevo mensaje',
    description: 'Entró un correo nuevo en alguna de las bandejas.',
    defaults: PANEL_ONLY,
    maxPerWindow: 40,
  },
  [NotificationType.CUSTOMER_WITHDRAWAL_REQUEST]: {
    category: NotificationCategory.CUSTOMERS,
    priority: NotificationPriority.HIGH,
    label: 'Solicitud de arrepentimiento',
    description: 'Un cliente inició un trámite por el botón de arrepentimiento.',
    defaults: PANEL_PUSH,
    maxPerWindow: 20,
  },
  [NotificationType.CUSTOMER_UNANSWERED]: {
    category: NotificationCategory.CUSTOMERS,
    priority: NotificationPriority.NORMAL,
    label: 'Consulta sin responder',
    description: 'Un mensaje o un trámite sigue sin respuesta pasado el plazo configurado.',
    defaults: PANEL_ONLY,
    maxPerWindow: 30,
  },

  [NotificationType.SECURITY_ADMIN_LOCKOUT]: {
    category: NotificationCategory.SECURITY,
    priority: NotificationPriority.CRITICAL,
    label: 'Intentos sospechosos de acceso',
    description: 'Una cuenta de administrador fue bloqueada por intentos de ingreso fallidos.',
    defaults: ALL_CHANNELS,
    maxPerWindow: 5,
  },
  [NotificationType.SECURITY_IP_BLOCKED]: {
    category: NotificationCategory.SECURITY,
    priority: NotificationPriority.NORMAL,
    label: 'IP bloqueada',
    description: 'Se bloqueó temporalmente una IP por un patrón de abuso.',
    defaults: PANEL_ONLY,
    maxPerWindow: 10,
  },

  [NotificationType.SYSTEM_EMAIL_FAILED]: {
    category: NotificationCategory.SYSTEM,
    priority: NotificationPriority.HIGH,
    label: 'Fallo de envío de correo',
    description: 'Un correo del sistema no pudo enviarse.',
    defaults: PANEL_ONLY,
    maxPerWindow: 5,
  },
  [NotificationType.SYSTEM_JOB_FAILED]: {
    category: NotificationCategory.SYSTEM,
    priority: NotificationPriority.HIGH,
    label: 'Fallo de un proceso programado',
    description: 'Una tarea automática del sistema terminó con error.',
    defaults: PANEL_PUSH,
    maxPerWindow: 5,
  },
  [NotificationType.SYSTEM_ERROR]: {
    category: NotificationCategory.SYSTEM,
    priority: NotificationPriority.CRITICAL,
    label: 'Error operativo',
    description: 'Un error del sistema que requiere atención.',
    defaults: ALL_CHANNELS,
    maxPerWindow: 5,
  },
};

export const isCritical = (type: NotificationType): boolean =>
  NOTIFICATION_CATALOG[type].priority === NotificationPriority.CRITICAL;

/**
 * Canales efectivos de un admin para un evento: su preferencia guardada si existe, si no los
 * defaults del catálogo. Regla dura: un evento crítico SIEMPRE queda en el panel, aunque el admin
 * lo haya desactivado - puede apagarle push/email, no ocultarlo.
 */
export function resolveChannels(
  type: NotificationType,
  preference?: { enabled: boolean; inApp: boolean; push: boolean; email: boolean } | null,
): ChannelSet {
  const definition = NOTIFICATION_CATALOG[type];
  const critical = definition.priority === NotificationPriority.CRITICAL;

  if (!preference) return definition.defaults;
  if (!preference.enabled) {
    return { inApp: critical, push: false, email: false };
  }
  return {
    inApp: critical || preference.inApp,
    push: preference.push,
    email: preference.email,
  };
}
