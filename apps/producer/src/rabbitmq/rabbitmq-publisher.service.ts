import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { ChannelModel, ConfirmChannel } from 'amqplib';

import {
  DomainEventDto,
  EventPublisher,
  RABBITMQ_DEFAULTS,
  RABBITMQ_HEADERS,
  RABBITMQ_TOPOLOGY,
} from '@app/shared';

@Injectable()
export class RabbitMqPublisherService implements EventPublisher, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqPublisherService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  constructor(private readonly configService: ConfigService) {}

  async publish(event: DomainEventDto): Promise<void> {
    const maxAttempts = this.getMaxAttempts();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const channel = await this.getChannel();
        await this.publishWithConfirm(channel, event);

        this.logger.log({
          message: 'Event published',
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          attempt,
        });
        return;
      } catch (error) {
        lastError = error;
        await this.closeConnection();
        this.logger.warn({
          message: 'Event publish failed',
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < maxAttempts) {
          await this.sleep(this.getBackoffMs(attempt));
        }
      }
    }

    throw new ServiceUnavailableException({
      message: 'RabbitMQ is unavailable',
      eventId: event.eventId,
      reason: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeConnection();
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    const connection = await amqp.connect(this.getRabbitMqUrl());
    const channel = await connection.createConfirmChannel();

    await channel.assertExchange(this.getExchange(), RABBITMQ_TOPOLOGY.exchangeType, {
      durable: true,
    });
    await channel.assertQueue(this.getQueue(), {
      durable: true,
    });
    await channel.bindQueue(this.getQueue(), this.getExchange(), this.getRoutingKey());

    this.connection = connection;
    this.channel = channel;

    return channel;
  }

  private publishWithConfirm(channel: ConfirmChannel, event: DomainEventDto): Promise<void> {
    return new Promise((resolve, reject) => {
      channel.publish(
        this.getExchange(),
        this.getRoutingKey(),
        Buffer.from(JSON.stringify(event)),
        {
          messageId: event.eventId,
          contentType: 'application/json',
          deliveryMode: 2,
          headers: {
            [RABBITMQ_HEADERS.correlationId]: event.correlationId,
            [RABBITMQ_HEADERS.retryCount]: 0,
          },
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });
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

  private getBackoffMs(attempt: number): number {
    return this.getRetryDelayMs() * 2 ** (attempt - 1);
  }

  private getMaxAttempts(): number {
    return this.configService.get<number>('MAX_RETRY_ATTEMPTS', RABBITMQ_DEFAULTS.maxRetryCount);
  }

  private getRetryDelayMs(): number {
    return this.configService.get<number>('RETRY_DELAY_MS', RABBITMQ_DEFAULTS.retryDelayMs);
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
