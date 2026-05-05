import { Module } from '@nestjs/common';

import { IdempotencyModule } from '../idempotency/idempotency.module';
import { TelegramModule } from '../telegram/telegram.module';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service';

@Module({
  imports: [IdempotencyModule, TelegramModule],
  providers: [RabbitMqConsumerService],
  exports: [RabbitMqConsumerService],
})
export class RabbitMqConsumerModule {}
