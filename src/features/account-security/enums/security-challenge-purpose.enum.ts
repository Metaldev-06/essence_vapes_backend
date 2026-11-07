/** Los 3 propósitos soportados - un challenge de un propósito nunca es válido para otro. */
export enum SecurityChallengePurpose {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
  PASSWORD_CHANGE = 'password_change',
}
