import { Controller, Get } from '@nestjs/common';

import { RABBITMQ_TOPOLOGY } from '@app/shared';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { service: string; status: string; exchange: string } {
    return {
      service: 'producer',
      status: 'ok',
      exchange: RABBITMQ_TOPOLOGY.exchange,
    };
  }
}
