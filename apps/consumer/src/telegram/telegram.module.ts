import { Module } from '@nestjs/common';

import { EventFormatter } from './event-formatter.service';
import { NOTIFICATION_SENDER } from './telegram.constants';
import { TelegramNotificationSender } from './telegram-notification.sender';

@Module({
  providers: [
    EventFormatter,
    TelegramNotificationSender,
    {
      provide: NOTIFICATION_SENDER,
      useExisting: TelegramNotificationSender,
    },
  ],
  exports: [EventFormatter, NOTIFICATION_SENDER],
})
export class TelegramModule {}
