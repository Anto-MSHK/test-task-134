import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';

import { DomainEventDto } from '@app/shared';

import { RabbitMqPublisherService } from './rabbitmq-publisher.service';

type PublisherInternals = {
  getChannel(): Promise<unknown>;
  publishWithConfirm(channel: unknown, event: DomainEventDto): Promise<void>;
  sleep(delayMs: number): Promise<void>;
};

describe(RabbitMqPublisherService.name, () => {
  it('retries publishing with exponential backoff before succeeding', async () => {
    const service = createService();
    const internals = service as unknown as PublisherInternals;
    const channel = {};
    internals.getChannel = jest.fn().mockResolvedValue(channel);
    internals.publishWithConfirm = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(undefined);
    internals.sleep = jest.fn().mockResolvedValue(undefined);

    await service.publish(createEvent());

    expect(internals.publishWithConfirm).toHaveBeenCalledTimes(2);
    expect(internals.sleep).toHaveBeenCalledWith(10);
  });

  it('returns ServiceUnavailableException after all publish attempts fail', async () => {
    const service = createService();
    const internals = service as unknown as PublisherInternals;
    internals.getChannel = jest.fn().mockResolvedValue({});
    internals.publishWithConfirm = jest.fn().mockRejectedValue(new Error('broker down'));
    internals.sleep = jest.fn().mockResolvedValue(undefined);

    await expect(service.publish(createEvent())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(internals.publishWithConfirm).toHaveBeenCalledTimes(3);
    expect(internals.sleep).toHaveBeenCalledTimes(2);
    expect(internals.sleep).toHaveBeenNthCalledWith(1, 10);
    expect(internals.sleep).toHaveBeenNthCalledWith(2, 20);
  });
});

function createService(): RabbitMqPublisherService {
  return new RabbitMqPublisherService({
    get: jest.fn((key: string, defaultValue: unknown) => {
      if (key === 'MAX_RETRY_ATTEMPTS') {
        return 3;
      }

      if (key === 'RETRY_DELAY_MS') {
        return 10;
      }

      return defaultValue;
    }),
  } as unknown as ConfigService);
}

function createEvent(): DomainEventDto {
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
  };
}
