import { InboxAddress } from '../enums/inbox-address.enum';

/** Pura - separada de `ResendInboxAdapter` (que tiene `ConfigService` inyectado) justamente para
 *  poder testearla sin DI, mismo criterio que el resto del proyecto (ver `lockout-tier.helper.ts`). */
export function resolveInboxAddress(
  addresses: Record<InboxAddress, string>,
  emailAddress: string,
): InboxAddress | null {
  const normalized = emailAddress.toLowerCase().trim();
  const match = (Object.entries(addresses) as [InboxAddress, string][]).find(
    ([, address]) => address.toLowerCase() === normalized,
  );
  return match ? match[0] : null;
}
