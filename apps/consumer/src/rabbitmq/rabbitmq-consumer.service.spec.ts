import { ConfigService } from '@nestjs/config';
import { Channel, ConsumeMessage } from 'amqplib';

import {
  DomainEventDto,
  IdempotencyStore,
  NotificationSender,
  RABBITMQ_HEADERS,
  RABBITMQ_TOPOLOGY,
} from '@app/shared';

import { TelegramNotificationError } from '../telegram/telegram.errors';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service';

type ProcessEventTarget = {
  processEvent(event: DomainEventDto): Promise<void>;
};

type HandleMessageTarget = {
  handleMessage(channel: Channel, message: ConsumeMessage): Promise<void>;
};

describe(RabbitMqConsumerService.name, () => {
  it('sends a Telegram notification once for duplicate eventId', async () => {
    const processedEvents = new Set<string>();
    const notificationSender = createNotificationSender();
    const idempotencyStore = createIdempotencyStore(processedEvents);
    const service = createService(
      notificationSender,
      idempotencyStore,
    ) as unknown as ProcessEventTarget;
    const event = createEvent();

    await service.processEvent(event);
    await service.processEvent(event);

    expect(notificationSender.send).toHaveBeenCalledTimes(1);
    expect(notificationSender.send).toHaveBeenCalledWith(event);
    expect(idempotencyStore.markProcessed).toHaveBeenCalledTimes(1);
    expect(idempotencyStore.markProcessed).toHaveBeenCalledWith(event.eventId);
  });

  it('acks a successfully processed message', async () => {
    const notificationSender = createNotificationSender();
    const idempotencyStore = createIdempotencyStore();
    const service = createService(
      notificationSender,
      idempotencyStore,
    ) as unknown as HandleMessageTarget;
    const channel = createChannel();
    const message = createMessage(createEvent());

    await service.handleMessage(channel, message);

    expect(notificationSender.send).toHaveBeenCalledWith(createEvent());
    expect(idempotencyStore.markProcessed).toHaveBeenCalledWith(createEvent().eventId);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('acks duplicate messages without sending a second notification', async () => {
    const processedEvents = new Set([createEvent().eventId]);
    const notificationSender = createNotificationSender();
    const idempotencyStore = createIdempotencyStore(processedEvents);
    const service = createService(
      notificationSender,
      idempotencyStore,
    ) as unknown as HandleMessageTarget;
    const channel = createChannel();
    const message = createMessage(createEvent());

    await service.handleMessage(channel, message);

    expect(notificationSender.send).not.toHaveBeenCalled();
    expect(idempotencyStore.markProcessed).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('routes retryable processing errors to the retry queue', async () => {
    const notificationSender = createNotificationSender(
      new TelegramNotificationError('temporary telegram outage', true, 502),
    );
    const service = createService(notificationSender) as unknown as HandleMessageTarget;
    const channel = createChannel();
    const message = createMessage(createEvent(), 1);

    await service.handleMessage(channel, message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      RABBITMQ_TOPOLOGY.retryQueue,
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [RABBITMQ_HEADERS.retryCount]: 2,
        }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('routes non-retryable processing errors to the DLQ', async () => {
    const notificationSender = createNotificationSender(
      new TelegramNotificationError('bad chat id', false, 400),
    );
    const service = createService(notificationSender) as unknown as HandleMessageTarget;
    const channel = createChannel();
    const message = createMessage(createEvent());

    await service.handleMessage(channel, message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      RABBITMQ_TOPOLOGY.deadLetterQueue,
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [RABBITMQ_HEADERS.retryCount]: 0,
        }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('routes retryable errors exceeding max retry count to the DLQ', async () => {
    const notificationSender = createNotificationSender(
      new TelegramNotificationError('temporary telegram outage', true, 502),
    );
    const service = createService(notificationSender) as unknown as HandleMessageTarget;
    const channel = createChannel();
    const message = createMessage(createEvent(), 3);

    await service.handleMessage(channel, message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      RABBITMQ_TOPOLOGY.deadLetterQueue,
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [RABBITMQ_HEADERS.retryCount]: 3,
        }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('routes invalid messages to the DLQ without retrying', async () => {
    const notificationSender = createNotificationSender();
    const service = createService(notificationSender) as unknown as HandleMessageTarget;
    const channel = createChannel();
    const message = {
      ...createMessage(createEvent()),
      content: Buffer.from('not-json'),
    };

    await service.handleMessage(channel, message);

    expect(notificationSender.send).not.toHaveBeenCalled();
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      RABBITMQ_TOPOLOGY.deadLetterQueue,
      message.content,
      expect.any(Object),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });
});

function createService(
  notificationSender = createNotificationSender(),
  idempotencyStore = createIdempotencyStore(),
): RabbitMqConsumerService {
  const configService = {
    get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
  } as unknown as ConfigService;

  return new RabbitMqConsumerService(configService, notificationSender, idempotencyStore);
}

function createNotificationSender(error?: Error): jest.Mocked<NotificationSender> {
  return {
    send: jest.fn(async (_event: DomainEventDto) => {
      if (error) {
        throw error;
      }
    }),
  };
}

function createIdempotencyStore(
  processedEvents = new Set<string>(),
): jest.Mocked<IdempotencyStore> {
  return {
    hasProcessed: jest.fn(async (eventId: string) => processedEvents.has(eventId)),
    markProcessed: jest.fn(async (eventId: string) => {
      processedEvents.add(eventId);
    }),
  };
}

function createChannel(): jest.Mocked<Channel> {
  return {
    ack: jest.fn(),
    nack: jest.fn(),
    sendToQueue: jest.fn().mockReturnValue(true),
    once: jest.fn(),
  } as unknown as jest.Mocked<Channel>;
}

function createMessage(event: DomainEventDto, retryCount = 0): ConsumeMessage {
  return {
    fields: {} as ConsumeMessage['fields'],
    content: Buffer.from(JSON.stringify(event)),
    properties: {
      messageId: event.eventId,
      contentType: 'application/json',
      correlationId: event.correlationId,
      headers: {
        [RABBITMQ_HEADERS.retryCount]: retryCount,
      },
    },
  } as unknown as ConsumeMessage;
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
