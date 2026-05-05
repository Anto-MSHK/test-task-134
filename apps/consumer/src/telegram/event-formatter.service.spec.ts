import { DomainEventDto } from '@app/shared';

import { EventFormatter } from './event-formatter.service';

describe(EventFormatter.name, () => {
  const formatter = new EventFormatter();

  it('formats order.created events', () => {
    const event = createEvent({
      eventType: 'order.created',
      payload: {
        orderId: 'ORD-1001',
        amount: 129.99,
        currency: 'USD',
      },
    });

    expect(formatter.format(event)).toBe(
      [
        'New order created',
        'Order ID: ORD-1001',
        'Amount: 129.99 USD',
        'Event ID: 7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25',
        'Occurred at: 2026-05-02T12:00:00.000Z',
      ].join('\n'),
    );
  });

  it('formats order.created with missing orderId as n/a', () => {
    const event = createEvent({
      eventType: 'order.created',
      payload: { amount: 50 },
    });

    const result = formatter.format(event);

    expect(result).toContain('Order ID: n/a');
    expect(result).toContain('Amount: 50');
  });

  it('formats order.created with missing amount gracefully', () => {
    const event = createEvent({
      eventType: 'order.created',
      payload: { orderId: 'ORD-1' },
    });

    const result = formatter.format(event);

    expect(result).toContain('Amount: n/a');
  });

  it('formats generic events using the default format', () => {
    const event = createEvent({
      eventType: 'user.registered',
      payload: { userId: 'USR-42', email: 'test@example.com' },
    });

    const result = formatter.format(event);

    expect(result).toContain('Event: user.registered');
    expect(result).toContain('Event ID: 7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25');
    expect(result).toContain('Occurred at: 2026-05-02T12:00:00.000Z');
    expect(result).toContain('Correlation ID: correlation-1');
    expect(result).toContain('Payload:');
    expect(result).toContain('"userId": "USR-42"');
  });

  it('includes pretty-printed JSON payload in the default format', () => {
    const event = createEvent({
      eventType: 'generic.event',
      payload: { key: 'value', nested: { a: 1 } },
    });

    const result = formatter.format(event);

    expect(result).toContain(JSON.stringify(event.payload, null, 2));
  });
});

function createEvent(overrides: Partial<DomainEventDto> = {}): DomainEventDto {
  return {
    eventId: '7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25',
    eventType: 'order.created',
    occurredAt: '2026-05-02T12:00:00.000Z',
    correlationId: 'correlation-1',
    recipient: {
      telegramChatId: '123456789',
    },
    payload: {
      orderId: 'ORD-1001',
      amount: 129.99,
      currency: 'USD',
    },
    ...overrides,
  };
}
