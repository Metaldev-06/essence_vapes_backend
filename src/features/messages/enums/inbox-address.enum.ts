/**
 * Las 3 bandejas de trabajo reales (no incluye `no-reply`, que nunca es una bandeja consultable
 * desde el panel - ver `resend.config.ts`). El valor de cada miembro es justamente la dirección
 * real, así sirve como clave de lookup directa contra `EmailAddresses` sin un segundo mapeo.
 */
export enum InboxAddress {
  CONTACTO = 'contacto',
  VENTAS = 'ventas',
  SOPORTE = 'soporte',
}

export const INBOX_ADDRESS_LABELS: Record<InboxAddress, string> = {
  [InboxAddress.CONTACTO]: 'Contacto',
  [InboxAddress.VENTAS]: 'Ventas',
  [InboxAddress.SOPORTE]: 'Soporte',
};
