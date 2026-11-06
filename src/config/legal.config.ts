import { registerAs } from '@nestjs/config';

/**
 * Identificación legal/comercial del titular (Ley 24.240 art. 4/32, Resol. ARCA vigente sobre
 * identificación fiscal en e-commerce). Fuente única: cambiar un dato acá es cambiar una env var
 * y reiniciar, sin tocar el frontend (que lo consume vía GET /api/v1/legal/info).
 *
 * Ningún valor se inventa: si la env var no está seteada, se expone un placeholder
 * "[COMPLETAR: ...]" explícito en vez de un dato ficticio. Ver COMPLIANCE_ARGENTINA.md.
 */
export default registerAs('legal', () => ({
  businessName: process.env.LEGAL_BUSINESS_NAME || 'Essence Vapes',
  legalName: process.env.LEGAL_LEGAL_NAME || '[COMPLETAR: razón social o nombre del titular]',
  cuit: process.env.LEGAL_CUIT || '[COMPLETAR: CUIT]',
  address: process.env.LEGAL_ADDRESS || '[COMPLETAR: domicilio comercial o legal]',
  province: process.env.LEGAL_PROVINCE || '[COMPLETAR: provincia]',
  locality: process.env.LEGAL_LOCALITY || '[COMPLETAR: localidad]',
  supportEmail: process.env.LEGAL_SUPPORT_EMAIL || '[COMPLETAR: email de atención al cliente]',
  whatsapp: process.env.LEGAL_WHATSAPP || '[COMPLETAR: WhatsApp comercial]',
  businessHours: process.env.LEGAL_BUSINESS_HOURS || '[COMPLETAR: horarios de atención]',
  vapesSaleEnforcementEnabled: process.env.VAPES_SALE_ENFORCEMENT_ENABLED === 'true',
}));
