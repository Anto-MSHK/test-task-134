import { Module } from '@nestjs/common';

import { RabbitMqPublisherModule } from '../rabbitmq/rabbitmq-publisher.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [RabbitMqPublisherModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
