import { Controller, Get } from '@nestjs/common';

import { RabbitMqPublisherService } from './rabbitmq/rabbitmq-publisher.service';

@Controller('health')
export class HealthController {
  constructor(private readonly publisher: RabbitMqPublisherService) {}

  @Get()
  getHealth(): { service: string; status: string; rabbitmq: string } {
    const rabbitmqStatus = this.publisher.isHealthy() ? 'connected' : 'disconnected';
    return {
      service: 'producer',
      status: 'ok',
      rabbitmq: rabbitmqStatus,
    };
  }
}
