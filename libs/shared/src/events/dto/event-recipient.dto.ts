import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class EventRecipientDto {
  @ApiProperty({
    description: 'Telegram chat identifier that should receive the notification.',
    example: '123456789',
  })
  @IsString()
  @IsNotEmpty()
  telegramChatId!: string;
}
