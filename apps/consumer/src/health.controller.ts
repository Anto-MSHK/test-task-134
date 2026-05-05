import { Controller, Get } from '@nestjs/common';

import { RabbitMqConsumerService } from './rabbitmq/rabbitmq-consumer.service';

@Controller('health')
export class HealthController {
  constructor(private readonly consumer: RabbitMqConsumerService) {}

  @Get()
  getHealth(): { service: string; status: string; rabbitmq: string } {
    const rabbitmqStatus = this.consumer.isHealthy() ? 'connected' : 'disconnected';
    return {
      service: 'consumer',
      status: 'ok',
      rabbitmq: rabbitmqStatus,
    };
  }
}
