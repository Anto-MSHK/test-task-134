export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

export const IDEMPOTENCY_DEFAULTS = {
  ttlMs: 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
} as const;
