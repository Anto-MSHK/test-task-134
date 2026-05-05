export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');

export const TELEGRAM_DEFAULTS = {
  maxRetryAttempts: 3,
  retryDelayMs: 500,
} as const;
