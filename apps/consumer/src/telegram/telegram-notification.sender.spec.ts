import { ConfigService } from '@nestjs/config';

import { DomainEventDto } from '@app/shared';

import { EventFormatter } from './event-formatter.service';
import { TelegramNotificationSender } from './telegram-notification.sender';

type TelegramSenderInternals = {
  sleep(delayMs: number): Promise<void>;
};

describe(TelegramNotificationSender.name, () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends a Telegram message on success', async () => {
    const sender = createSender();
    global.fetch = jest
      .fn()
      .mockResolvedValue(createTelegramResponse(200));

    await sender.send(createEvent());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('123456789'),
      }),
    );
  });

  it('does not retry non-retryable 400 Telegram responses', async () => {
    const sender = createSender();
    global.fetch = jest
      .fn()
      .mockResolvedValue(createTelegramResponse(400, 'Bad Request: chat not found'));

    await expect(sender.send(createEvent())).rejects.toMatchObject({
      retryable: false,
      statusCode: 400,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable 401 Telegram responses', async () => {
    const sender = createSender();
    global.fetch = jest
      .fn()
      .mockResolvedValue(createTelegramResponse(401, 'Unauthorized'));

    await expect(sender.send(createEvent())).rejects.toMatchObject({
      retryable: false,
      statusCode: 401,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable 403 Telegram responses', async () => {
    const sender = createSender();
    global.fetch = jest
      .fn()
      .mockResolvedValue(createTelegramResponse(403, 'Forbidden'));

    await expect(sender.send(createEvent())).rejects.toMatchObject({
      retryable: false,
      statusCode: 403,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries retryable 429 Telegram responses', async () => {
    const sender = createSender();
    const internals = sender as unknown as TelegramSenderInternals;
    internals.sleep = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createTelegramResponse(429, 'Too Many Requests'))
      .mockResolvedValueOnce(createTelegramResponse(200));

    await sender.send(createEvent());

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(internals.sleep).toHaveBeenCalledWith(10);
  });

  it('retries retryable 500 Telegram responses', async () => {
    const sender = createSender();
    const internals = sender as unknown as TelegramSenderInternals;
    internals.sleep = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createTelegramResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(createTelegramResponse(200));

    await sender.send(createEvent());

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries retryable 502 Telegram responses', async () => {
    const sender = createSender();
    const internals = sender as unknown as TelegramSenderInternals;
    internals.sleep = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createTelegramResponse(502, 'Bad Gateway'))
      .mockResolvedValueOnce(createTelegramResponse(200));

    await sender.send(createEvent());

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('classifies network errors as retryable Telegram errors', async () => {
    const sender = createSender({ maxAttempts: 1 });
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

    await expect(sender.send(createEvent())).rejects.toEqual(
      expect.objectContaining({
        retryable: true,
      }),
    );
  });

  it('throws after exhausting all retry attempts', async () => {
    const sender = createSender({ maxAttempts: 2 });
    const internals = sender as unknown as TelegramSenderInternals;
    internals.sleep = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValue(createTelegramResponse(429, 'Too Many Requests'));

    await expect(sender.send(createEvent())).rejects.toMatchObject({
      retryable: true,
      statusCode: 429,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws when TELEGRAM_BOT_TOKEN is not configured', async () => {
    const sender = createSender({ botToken: null });

    await expect(sender.send(createEvent())).rejects.toMatchObject({
      retryable: false,
    });
  });
});

function createSender(
  options: { maxAttempts?: number; botToken?: string | null } = {},
): TelegramNotificationSender {
  const configService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'TELEGRAM_BOT_TOKEN') {
        return 'botToken' in options ? options.botToken : 'test-token';
      }

      if (key === 'TELEGRAM_MAX_RETRY_ATTEMPTS') {
        return options.maxAttempts ?? 2;
      }

      if (key === 'TELEGRAM_RETRY_DELAY_MS') {
        return 10;
      }

      return defaultValue;
    }),
  } as unknown as ConfigService;

  return new TelegramNotificationSender(configService, new EventFormatter());
}

function createTelegramResponse(status: number, description?: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      description,
    }),
  } as unknown as Response;
}

function createEvent(): DomainEventDto {
  return {
    eventId: '7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25',
    eventType: 'order.created',
    occurredAt: '2026-05-02T12:00:00.000Z',
    correlationId: 'correlation-1',
    recipient: {
      telegramChatId: '123456789',
    },
    payload: {
      orderId: 'ORD-1001',
      amount: 129.99,
      currency: 'USD',
    },
  };
}
