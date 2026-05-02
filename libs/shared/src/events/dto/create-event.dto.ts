import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { EventRecipientDto } from './event-recipient.dto';

export class CreateEventDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ValidateNested()
  @Type(() => EventRecipientDto)
  recipient!: EventRecipientDto;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  correlationId?: string;
}
