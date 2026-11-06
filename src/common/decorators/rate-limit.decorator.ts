import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/** Combinar con `@UseGuards(SimpleRateLimitGuard)` - ver ese guard para el porqué. */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
