export const RABBITMQ_TOPOLOGY = {
  exchange: 'events.exchange',
  exchangeType: 'direct',
  routingKey: 'events.notification',
  queue: 'events.notification.queue',
  retryQueue: 'events.notification.retry.queue',
  deadLetterQueue: 'events.notification.dlq',
} as const;

export const RABBITMQ_HEADERS = {
  correlationId: 'x-correlation-id',
  retryCount: 'x-retry-count',
} as const;

export const RABBITMQ_DEFAULTS = {
  prefetch: 5,
  retryDelayMs: 5000,
  maxRetryCount: 3,
} as const;
