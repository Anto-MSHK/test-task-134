import { Injectable } from '@nestjs/common';

import { DomainEventDto } from '@app/shared';

@Injectable()
export class EventFormatter {
  format(event: DomainEventDto): string {
    if (event.eventType === 'order.created') {
      return this.formatOrderCreated(event);
    }

    return [
      `Event: ${event.eventType}`,
      `Event ID: ${event.eventId}`,
      `Occurred at: ${event.occurredAt}`,
      `Correlation ID: ${event.correlationId}`,
      '',
      'Payload:',
      JSON.stringify(event.payload, null, 2),
    ].join('\n');
  }

  private formatOrderCreated(event: DomainEventDto): string {
    const payload = event.payload as Record<string, unknown>;
    const amount = this.formatAmount(payload.amount, payload.currency);

    return [
      'New order created',
      `Order ID: ${this.formatValue(payload.orderId)}`,
      `Amount: ${amount}`,
      `Event ID: ${event.eventId}`,
      `Occurred at: ${event.occurredAt}`,
    ].join('\n');
  }

  private formatAmount(amount: unknown, currency: unknown): string {
    if (typeof amount !== 'number') {
      return this.formatValue(amount);
    }

    if (typeof currency === 'string' && currency.length > 0) {
      return `${amount} ${currency}`;
    }

    return String(amount);
  }

  private formatValue(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return 'n/a';
    }

    return String(value);
  }
}
