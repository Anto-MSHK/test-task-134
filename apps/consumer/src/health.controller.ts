import { Controller, Get } from '@nestjs/common';

import { RABBITMQ_TOPOLOGY } from '@app/shared';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { service: string; status: string; queue: string } {
    return {
      service: 'consumer',
      status: 'ok',
      queue: RABBITMQ_TOPOLOGY.queue,
    };
  }
}
