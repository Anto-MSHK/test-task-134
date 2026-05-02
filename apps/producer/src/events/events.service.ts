import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { CreateEventDto, DomainEventDto } from '@app/shared';

import { RabbitMqPublisherService } from '../rabbitmq/rabbitmq-publisher.service';

@Injectable()
export class EventsService {
  constructor(private readonly publisher: RabbitMqPublisherService) {}

  async publish(
    payload: CreateEventDto,
    idempotencyKey?: string,
  ): Promise<{ eventId: string; status: 'published' }> {
    const event = this.toDomainEvent(payload, idempotencyKey);

    await this.publisher.publish(event);

    return {
      eventId: event.eventId,
      status: 'published',
    };
  }

  private toDomainEvent(payload: CreateEventDto, idempotencyKey?: string): DomainEventDto {
    if (idempotencyKey && !isUUID(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be a UUID when used as eventId');
    }

    return {
      eventId: payload.eventId ?? idempotencyKey ?? randomUUID(),
      eventType: payload.eventType,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
      recipient: payload.recipient,
      payload: payload.payload,
      correlationId: payload.correlationId ?? randomUUID(),
    };
  }
}
