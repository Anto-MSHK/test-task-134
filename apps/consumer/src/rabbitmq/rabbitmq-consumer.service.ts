import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

import {
  DomainEventDto,
  RABBITMQ_DEFAULTS,
  RABBITMQ_HEADERS,
  RABBITMQ_TOPOLOGY,
} from '@app/shared';

@Injectable()
export class RabbitMqConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumerService.name);
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.start();
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
      prefetch,
    });
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
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        retryCount,
      });

      await this.processEvent(event);

      channel.ack(message);
      this.logger.log({
        message: 'Event processed',
        eventId: event.eventId,
        eventType: event.eventType,
        correlationId: event.correlationId,
        retryCount,
      });
    } catch (error) {
      if (error instanceof InvalidEventMessageError) {
        channel.ack(message);
        this.logger.warn({
          message: 'Invalid event message acknowledged',
          error: error.message,
          retryCount,
        });
        return;
      }

      channel.nack(message, false, true);
      this.logger.error({
        message: 'Event processing failed, message requeued',
        retryCount: retryCount + 1,
        error: error instanceof Error ? error.message : String(error),
      });
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

  private async processEvent(_event: DomainEventDto): Promise<void> {
    return Promise.resolve();
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

  private getPrefetch(): number {
    return this.configService.get<number>('RABBITMQ_PREFETCH', RABBITMQ_DEFAULTS.prefetch);
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
