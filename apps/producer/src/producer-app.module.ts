import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '@app/shared';

import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { RabbitMqPublisherModule } from './rabbitmq/rabbitmq-publisher.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    RabbitMqPublisherModule,
    EventsModule,
  ],
  controllers: [HealthController],
})
export class ProducerAppModule {}
