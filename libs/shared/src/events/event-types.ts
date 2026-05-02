export const EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
  GENERIC: 'generic.event',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES] | string;

export type EventPayload = Record<string, unknown>;
