import { BadRequestException } from '@nestjs/common';

import { CreateEventDto } from '@app/shared';

import { RabbitMqPublisherService } from '../rabbitmq/rabbitmq-publisher.service';
import { EventsService } from './events.service';

describe(EventsService.name, () => {
  const payload: CreateEventDto = {
    eventType: 'order.created',
    recipient: {
      telegramChatId: '123456789',
    },
    payload: {
      orderId: 'ORD-1001',
    },
  };

  it('generates eventId, occurredAt and correlationId when they are omitted', async () => {
    const publisher = createPublisherMock();
    const service = new EventsService(publisher);

    const response = await service.publish(payload);

    expect(response).toEqual({
      eventId: expect.any(String),
      status: 'published',
    });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: response.eventId,
        eventType: payload.eventType,
        occurredAt: expect.any(String),
        correlationId: expect.any(String),
      }),
    );
  });

  it('uses Idempotency-Key as eventId when body eventId is omitted', async () => {
    const publisher = createPublisherMock();
    const service = new EventsService(publisher);
    const idempotencyKey = '7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25';

    await service.publish(payload, idempotencyKey);

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: idempotencyKey,
      }),
    );
  });

  it('rejects a non-UUID Idempotency-Key', async () => {
    const service = new EventsService(createPublisherMock());

    await expect(service.publish(payload, 'not-a-uuid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

function createPublisherMock(): jest.Mocked<RabbitMqPublisherService> {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RabbitMqPublisherService>;
}
