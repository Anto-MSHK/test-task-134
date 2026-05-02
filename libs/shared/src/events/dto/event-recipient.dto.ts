import { IsNotEmpty, IsString } from 'class-validator';

export class EventRecipientDto {
  @IsString()
  @IsNotEmpty()
  telegramChatId!: string;
}
