/** Tipos de evento que alimentan tanto el audit trail como la detección de abuso por IP. */
export enum SecurityEventType {
  AUTH_FAILURE = 'auth_failure',
  AUTH_LOCKOUT = 'auth_lockout',
  RATE_LIMITED = 'rate_limited',
  FORBIDDEN = 'forbidden',
  NOT_FOUND_SENSITIVE = 'not_found_sensitive',
  IP_BLOCKED = 'ip_blocked',
  ADMIN_ACCESS_DENIED = 'admin_access_denied',
}
