/** "Expirado" se calcula contra `expiresAt`, no se persiste como estado propio. */
export enum SecurityChallengeStatus {
  PENDING = 'pending',
  CONSUMED = 'consumed',
  INVALIDATED = 'invalidated',
}
