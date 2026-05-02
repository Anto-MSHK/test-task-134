import {
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { EventPayload } from '../event-types';
import { EventRecipientDto } from './event-recipient.dto';

export class DomainEventDto {
  @IsUUID()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @IsDateString()
  occurredAt!: string;

  @ValidateNested()
  @Type(() => EventRecipientDto)
  recipient!: EventRecipientDto;

  @IsObject()
  payload!: EventPayload;

  @IsString()
  @IsNotEmpty()
  correlationId!: string;
}
