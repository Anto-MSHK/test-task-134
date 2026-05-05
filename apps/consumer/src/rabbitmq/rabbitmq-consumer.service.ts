import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as amqp from 'amqplib';
import { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

import {
  DomainEventDto,
  IdempotencyStore,
  NotificationSender,
  RABBITMQ_DEFAULTS,
  RABBITMQ_HEADERS,
  RABBITMQ_TOPOLOGY,
} from '@app/shared';

import { IDEMPOTENCY_STORE } from '../idempotency/idempotency.constants';
import { NOTIFICATION_SENDER } from '../telegram/telegram.constants';
import { TelegramNotificationError } from '../telegram/telegram.errors';

@Injectable()
export class RabbitMqConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumerService.name);
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(
    private readonly configService: ConfigService,
    @Inject(NOTIFICATION_SENDER)
    private readonly notificationSender: NotificationSender,
    @Inject(IDEMPOTENCY_STORE)
    private readonly idempotencyStore: IdempotencyStore,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startWithRetry();
  }

  isHealthy(): boolean {
    return this.channel !== undefined;
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeConnection();
  }

  private async start(): Promise<void> {
    const connection = await amqp.connect(this.getRabbitMqUrl());
    const channel = await connection.createChannel();

    await channel.assertExchange(this.getExchange(), RABBITMQ_TOPOLOGY.exchangeType, {
      durable: true,
    });
    await channel.assertQueue(this.getQueue(), {
      durable: true,
    });
    await channel.assertQueue(this.getRetryQueue(), {
      durable: true,
      messageTtl: this.getRetryDelayMs(),
      deadLetterExchange: this.getExchange(),
      deadLetterRoutingKey: this.getRoutingKey(),
    });
    await channel.assertQueue(this.getDeadLetterQueue(), {
      durable: true,
    });
    await channel.bindQueue(this.getQueue(), this.getExchange(), this.getRoutingKey());
    const prefetch = this.getPrefetch();
    await channel.prefetch(prefetch);

    await channel.consume(
      this.getQueue(),
      (message) => {
        void this.handleMessage(channel, message);
      },
      { noAck: false },
    );

    this.connection = connection;
    this.channel = channel;

    this.logger.log({
      message: 'RabbitMQ consumer started',
      queue: this.getQueue(),
      retryQueue: this.getRetryQueue(),
      deadLetterQueue: this.getDeadLetterQueue(),
      prefetch,
    });
  }

  private async startWithRetry(): Promise<void> {
    const maxAttempts = this.getConnectionRetryAttempts();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.start();
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn({
          message: 'RabbitMQ consumer startup failed',
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < maxAttempts) {
          await this.sleep(this.getConnectionRetryDelayMs());
        }
      }
    }

    throw lastError;
  }

  private async handleMessage(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) {
      return;
    }

    const retryCount = this.getRetryCount(message);

    try {
      const event = await this.parseAndValidate(message);

      this.logger.log({
        message: 'Event received',
        service: 'consumer',
        status: 'received',
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        retryCount,
      });

      await this.processEvent(event);

      channel.ack(message);
      this.logger.log({
        message: 'Event processed',
        service: 'consumer',
        status: 'processed',
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        retryCount,
      });
    } catch (error) {
      await this.handleProcessingFailure(channel, message, error, retryCount);
    }
  }

  private async parseAndValidate(message: ConsumeMessage): Promise<DomainEventDto> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(message.content.toString('utf8'));
    } catch (error) {
      throw new InvalidEventMessageError(
        `Message body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const event = plainToInstance(DomainEventDto, parsed);
    const validationErrors = await validate(event, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (validationErrors.length > 0) {
      throw new InvalidEventMessageError(
        `Message body failed validation: ${validationErrors.toString()}`,
      );
    }

    return event;
  }

  private async processEvent(event: DomainEventDto): Promise<void> {
    if (await this.idempotencyStore.hasProcessed(event.eventId)) {
      this.logger.log({
        message: 'Duplicate event skipped',
        service: 'consumer',
        status: 'duplicate_skipped',
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
      });
      return;
    }

    await this.notificationSender.send(event);
    await this.idempotencyStore.markProcessed(event.eventId);
  }

  private async handleProcessingFailure(
    channel: Channel,
    message: ConsumeMessage,
    error: unknown,
    retryCount: number,
  ): Promise<void> {
    try {
      if (error instanceof InvalidEventMessageError) {
        await this.sendToDeadLetterQueue(channel, message, retryCount, error);
        channel.ack(message);
        this.logger.warn({
          message: 'Invalid event message sent to DLQ',
          service: 'consumer',
          status: 'dlq',
          error: error.message,
          retryCount,
        });
        return;
      }

      if (this.isRetryableError(error) && retryCount < this.getMaxRetryCount()) {
        const nextRetryCount = retryCount + 1;
        await this.sendToRetryQueue(channel, message, nextRetryCount, error);
        channel.ack(message);
        this.logger.warn({
          message: 'Event processing failed, message sent to retry queue',
          service: 'consumer',
          status: 'retry',
          retryCount: nextRetryCount,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      await this.sendToDeadLetterQueue(channel, message, retryCount, error);
      channel.ack(message);
      this.logger.error({
        message: 'Event processing failed, message sent to DLQ',
        service: 'consumer',
        status: 'dlq',
        retryCount,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (routingError) {
      channel.nack(message, false, true);
      this.logger.error({
        message: 'Failed to route failed message, original message requeued',
        service: 'consumer',
        status: 'requeued',
        retryCount,
        error: routingError instanceof Error ? routingError.message : String(routingError),
      });
    }
  }

  private async sendToRetryQueue(
    channel: Channel,
    message: ConsumeMessage,
    retryCount: number,
    error: unknown,
  ): Promise<void> {
    await this.sendToQueue(channel, this.getRetryQueue(), message, retryCount, error);
  }

  private async sendToDeadLetterQueue(
    channel: Channel,
    message: ConsumeMessage,
    retryCount: number,
    error: unknown,
  ): Promise<void> {
    await this.sendToQueue(channel, this.getDeadLetterQueue(), message, retryCount, error);
  }

  private async sendToQueue(
    channel: Channel,
    queue: string,
    message: ConsumeMessage,
    retryCount: number,
    error: unknown,
  ): Promise<void> {
    const sent = channel.sendToQueue(queue, message.content, {
      messageId: message.properties.messageId,
      contentType: message.properties.contentType ?? 'application/json',
      deliveryMode: 2,
      persistent: true,
      correlationId: message.properties.correlationId,
      headers: {
        ...message.properties.headers,
        [RABBITMQ_HEADERS.retryCount]: retryCount,
        'x-error-message': error instanceof Error ? error.message : String(error),
      },
    });

    if (!sent) {
      await new Promise<void>((resolve) => {
        channel.once('drain', resolve);
      });
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof TelegramNotificationError) {
      return error.retryable;
    }

    return true;
  }

  private getRetryCount(message: ConsumeMessage): number {
    const rawRetryCount = message.properties.headers?.[RABBITMQ_HEADERS.retryCount];

    if (typeof rawRetryCount === 'number') {
      return rawRetryCount;
    }

    if (typeof rawRetryCount === 'string') {
      const parsed = Number(rawRetryCount);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private getRabbitMqUrl(): string {
    return this.configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672');
  }

  private getExchange(): string {
    return this.configService.get<string>('RABBITMQ_EXCHANGE', RABBITMQ_TOPOLOGY.exchange);
  }

  private getRoutingKey(): string {
    return this.configService.get<string>('RABBITMQ_ROUTING_KEY', RABBITMQ_TOPOLOGY.routingKey);
  }

  private getQueue(): string {
    return this.configService.get<string>('RABBITMQ_QUEUE', RABBITMQ_TOPOLOGY.queue);
  }

  private getRetryQueue(): string {
    return this.configService.get<string>('RABBITMQ_RETRY_QUEUE', RABBITMQ_TOPOLOGY.retryQueue);
  }

  private getDeadLetterQueue(): string {
    return this.configService.get<string>('RABBITMQ_DLQ', RABBITMQ_TOPOLOGY.deadLetterQueue);
  }

  private getPrefetch(): number {
    return this.configService.get<number>('RABBITMQ_PREFETCH', RABBITMQ_DEFAULTS.prefetch);
  }

  private getRetryDelayMs(): number {
    return this.configService.get<number>('RETRY_DELAY_MS', RABBITMQ_DEFAULTS.retryDelayMs);
  }

  private getMaxRetryCount(): number {
    return this.configService.get<number>('MAX_RETRY_ATTEMPTS', RABBITMQ_DEFAULTS.maxRetryCount);
  }

  private getConnectionRetryAttempts(): number {
    return this.configService.get<number>('RABBITMQ_CONNECTION_ATTEMPTS', 10);
  }

  private getConnectionRetryDelayMs(): number {
    return this.configService.get<number>('RABBITMQ_CONNECTION_RETRY_DELAY_MS', 1000);
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private async closeConnection(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;

    this.channel = undefined;
    this.connection = undefined;

    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}

class InvalidEventMessageError extends Error {}
