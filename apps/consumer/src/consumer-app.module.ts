import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '@app/shared';

import { HealthController } from './health.controller';
import { RabbitMqConsumerModule } from './rabbitmq/rabbitmq-consumer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    RabbitMqConsumerModule,
  ],
  controllers: [HealthController],
})
export class ConsumerAppModule {}
