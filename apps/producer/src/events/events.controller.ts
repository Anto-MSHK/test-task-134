import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CreateEventDto } from '@app/shared';

import { EventsService } from './events.service';

class PublishEventResponse {
  @ApiProperty({
    example: '7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25',
  })
  eventId!: string;

  @ApiProperty({
    example: 'published',
  })
  status!: 'published';
}

const orderCreatedExample: CreateEventDto = {
  eventType: 'order.created',
  occurredAt: '2026-05-02T11:00:00.000Z',
  recipient: {
    telegramChatId: '123456789',
  },
  payload: {
    orderId: 'ORD-1001',
    amount: 129.99,
    currency: 'USD',
  },
};

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(201)
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Optional UUID used as eventId when eventId is omitted from the body.',
    required: false,
    schema: {
      type: 'string',
      format: 'uuid',
      example: '7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25',
    },
  })
  @ApiBody({
    type: CreateEventDto,
    examples: {
      orderCreated: {
        summary: 'order.created event',
        value: orderCreatedExample,
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Event was published to RabbitMQ.',
    type: PublishEventResponse,
    schema: {
      example: {
        eventId: '7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25',
        status: 'published',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Request body or Idempotency-Key failed validation.',
  })
  @ApiServiceUnavailableResponse({
    description: 'RabbitMQ did not confirm publication after retries.',
  })
  publishEvent(
    @Body() payload: CreateEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PublishEventResponse> {
    return this.eventsService.publish(payload, idempotencyKey);
  }
}
