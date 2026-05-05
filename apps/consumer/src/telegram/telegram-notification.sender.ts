import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DomainEventDto, NotificationSender } from '@app/shared';

import { EventFormatter } from './event-formatter.service';
import { TELEGRAM_DEFAULTS } from './telegram.constants';
import { TelegramNotificationError } from './telegram.errors';

type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
};

@Injectable()
export class TelegramNotificationSender implements NotificationSender {
  private readonly logger = new Logger(TelegramNotificationSender.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly eventFormatter: EventFormatter,
  ) {}

  async send(event: DomainEventDto): Promise<void> {
    const maxAttempts = this.getMaxAttempts();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.sendOnce(event);
        this.logger.log({
          message: 'Telegram message sent',
          service: 'consumer',
          status: 'telegram_sent',
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          attempt,
        });
        return;
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error) || attempt === maxAttempts) {
          break;
        }

        this.logger.warn({
          message: 'Telegram send failed, retrying',
          service: 'consumer',
          status: 'telegram_retry',
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        await this.sleep(this.getBackoffMs(attempt));
      }
    }

    throw lastError;
  }

  private async sendOnce(event: DomainEventDto): Promise<void> {
    const token = this.getBotToken();
    const chatId = event.recipient.telegramChatId ?? this.getDefaultChatId();
    const response = await this.postMessage(token, {
      chat_id: chatId,
      text: this.eventFormatter.format(event),
    });

    if (!response.ok) {
      const body = await this.readResponseBody(response);
      throw this.createHttpError(response.status, body.description);
    }
  }

  private async postMessage(
    token: string,
    body: { chat_id: string; text: string },
  ): Promise<Response> {
    try {
      return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new TelegramNotificationError(
        `Telegram network error: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  private async readResponseBody(response: Response): Promise<TelegramSendMessageResponse> {
    try {
      return (await response.json()) as TelegramSendMessageResponse;
    } catch {
      return { ok: false };
    }
  }

  private createHttpError(statusCode: number, description?: string): TelegramNotificationError {
    const retryable = statusCode === 429 || statusCode >= 500;
    const reason = description ?? `HTTP ${statusCode}`;

    return new TelegramNotificationError(
      `Telegram sendMessage failed: ${reason}`,
      retryable,
      statusCode,
    );
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof TelegramNotificationError && error.retryable;
  }

  private getBotToken(): string {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token || token === 'replace-with-token') {
      throw new TelegramNotificationError('TELEGRAM_BOT_TOKEN is not configured', false);
    }

    return token;
  }

  private getDefaultChatId(): string {
    const chatId = this.configService.get<string>('TELEGRAM_DEFAULT_CHAT_ID');

    if (!chatId || chatId === 'replace-with-chat-id') {
      throw new TelegramNotificationError('TELEGRAM_DEFAULT_CHAT_ID is not configured', false);
    }

    return chatId;
  }

  private getMaxAttempts(): number {
    return this.configService.get<number>(
      'TELEGRAM_MAX_RETRY_ATTEMPTS',
      TELEGRAM_DEFAULTS.maxRetryAttempts,
    );
  }

  private getRetryDelayMs(): number {
    return this.configService.get<number>(
      'TELEGRAM_RETRY_DELAY_MS',
      TELEGRAM_DEFAULTS.retryDelayMs,
    );
  }

  private getBackoffMs(attempt: number): number {
    return this.getRetryDelayMs() * 2 ** (attempt - 1);
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
