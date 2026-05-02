import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { CreateEventDto } from '@app/shared';

import { EventsService } from './events.service';

interface PublishEventResponse {
  eventId: string;
  status: 'published';
}

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(201)
  publishEvent(
    @Body() payload: CreateEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PublishEventResponse> {
    return this.eventsService.publish(payload, idempotencyKey);
  }
}
