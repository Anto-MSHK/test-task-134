import { Module } from '@nestjs/common';

import { RabbitMqConsumerService } from './rabbitmq-consumer.service';

@Module({
  providers: [RabbitMqConsumerService],
})
export class RabbitMqConsumerModule {}
