# Event Notification Platform

NestJS monorepo: Producer Service принимает события через HTTP, публикует их в RabbitMQ; Consumer Service получает события, проверяет идемпотентность и отправляет уведомления в Telegram.

## Архитектура

```
Client / External System
        │
        ▼
Producer Service  (HTTP API, RabbitMQ publisher)
        │
        ▼
RabbitMQ (events.exchange / events.notification.queue)
        │
        ▼
Consumer Service  (RabbitMQ consumer, idempotency, retry/DLQ)
        │
        ▼
Telegram Bot API
```

### Сервисы

| Сервис | Порт | Описание |
|---|---|---|
| Producer | 3000 | HTTP API + RabbitMQ publisher |
| Consumer | 3001 | RabbitMQ consumer + Telegram integration |
| RabbitMQ | 5672 / 15672 | Брокер сообщений + Management UI |

### Почему Telegram внутри Consumer

Telegram-интеграция реализована как модуль (`TelegramModule`) внутри Consumer Service. Это сохраняет требуемые два микросервиса и оставляет чистую границу: при необходимости `TelegramModule` можно вынести в отдельный сервис без изменения бизнес-логики — достаточно заменить реализацию интерфейса `NotificationSender`.

## Требования к окружению

- Node.js >= 20
- Docker >= 24 и Docker Compose >= 2.20
- Telegram Bot Token (получить у [@BotFather](https://t.me/botfather))

## Быстрый запуск через Docker

```bash
cp .env.example .env
# Задать реальные значения TELEGRAM_BOT_TOKEN и TELEGRAM_DEFAULT_CHAT_ID в .env
docker compose up --build
```

Swagger UI: [http://localhost:3000/docs](http://localhost:3000/docs)

RabbitMQ Management UI: [http://localhost:15672](http://localhost:15672) (guest / guest)

## Локальная разработка

```bash
npm install
cp .env.example .env
# Поднять только RabbitMQ:
docker compose up rabbitmq
# В двух отдельных терминалах:
npm run start:producer:dev
npm run start:consumer:dev
```

Health Producer:

```bash
curl http://localhost:3000/health
```

Health Consumer:

```bash
curl http://localhost:3001/health
```

## Пример запроса

Отправить событие `order.created`:

```bash
curl -X POST http://localhost:3000/events \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25' \
  -d '{
    "eventType": "order.created",
    "recipient": { "telegramChatId": "123456789" },
    "payload": { "orderId": "ORD-1001", "amount": 129.99, "currency": "USD" }
  }'
```

Ожидаемый ответ:

```json
{ "eventId": "7a6a6e42-4f59-43c8-a8b7-2f43ed1c7a25", "status": "published" }
```

Поля `eventId` и `occurredAt` — опциональны. Если не переданы, Producer генерирует UUID и текущее время. `correlationId` тоже генерируется автоматически и прокидывается во все логи и RabbitMQ headers.

`Idempotency-Key` заголовок используется как `eventId` если `eventId` не передан в теле запроса.

## Swagger

Swagger UI доступен по адресу:

```
http://localhost:3000/docs
```

Отсюда можно отправить тестовый `POST /events` прямо из браузера.

## Тесты

```bash
npm test
```

Тесты покрывают:

- генерацию `eventId`, `occurredAt`, `correlationId` при их отсутствии;
- валидацию DTO входного события;
- retry-логику Publisher (exponential backoff, 503 после всех попыток);
- idempotency check Consumer (duplicate `eventId` → одно Telegram-уведомление);
- маршрутизацию в retry queue и DLQ;
- форматирование Telegram-сообщения;
- классификацию ошибок Telegram API (retryable / non-retryable).

## Конфигурация

Все переменные окружения описаны в `.env.example`.

| Переменная | По умолчанию | Описание |
|---|---|---|
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | AMQP-адрес брокера |
| `RABBITMQ_EXCHANGE` | `events.exchange` | Название exchange |
| `RABBITMQ_ROUTING_KEY` | `events.notification` | Routing key |
| `RABBITMQ_QUEUE` | `events.notification.queue` | Основная очередь |
| `RABBITMQ_RETRY_QUEUE` | `events.notification.retry.queue` | Retry-очередь с TTL |
| `RABBITMQ_DLQ` | `events.notification.dlq` | Dead-letter queue |
| `RABBITMQ_PREFETCH` | `5` | Prefetch count Consumer |
| `MAX_RETRY_ATTEMPTS` | `3` | Макс. попыток Publisher и Consumer |
| `RETRY_DELAY_MS` | `5000` | Базовая задержка retry (exponential backoff) |
| `TELEGRAM_BOT_TOKEN` | — | Токен Telegram-бота |
| `TELEGRAM_DEFAULT_CHAT_ID` | — | Chat ID по умолчанию если не передан в событии |
| `TELEGRAM_MAX_RETRY_ATTEMPTS` | `3` | Макс. попыток отправки Telegram |
| `TELEGRAM_RETRY_DELAY_MS` | `500` | Задержка между Telegram-ретраями |
| `IDEMPOTENCY_TTL_MS` | `86400000` | TTL записи в идемпотентном хранилище (24 ч) |

## Retry, DLQ и идемпотентность

### Retry Producer

При временной ошибке RabbitMQ Producer повторяет публикацию до `MAX_RETRY_ATTEMPTS` раз с exponential backoff (`RETRY_DELAY_MS * 2^(attempt-1)`). После исчерпания попыток клиент получает `503 Service Unavailable`.

### Retry Consumer

При retryable-ошибке обработки (временный сбой Telegram — 429, 5xx, network error) Consumer:

1. Копирует сообщение в `RABBITMQ_RETRY_QUEUE` с увеличенным `x-retry-count` в headers.
2. Делает `ack` исходного сообщения.
3. После истечения TTL retry-очереди сообщение автоматически возвращается в основную очередь через dead-letter exchange.

### Dead-letter Queue

Сообщение попадает в `RABBITMQ_DLQ` если:

- превышен лимит `MAX_RETRY_ATTEMPTS`;
- ошибка классифицирована как non-retryable (невалидный chat ID — 400, 401, 403);
- JSON в теле сообщения не прошёл валидацию.

Non-retryable ошибки не ретраятся — они сразу отправляются в DLQ.

### Идемпотентность

Consumer проверяет `eventId` в `IdempotencyStore` перед отправкой в Telegram:

- новое событие → обрабатывается → помечается как processed;
- дубликат → `ack` без повторной отправки;
- событие помечается processed **только после** успешной отправки Telegram.

Реализован `InMemoryIdempotencyStore` с TTL и периодической очисткой. Интерфейс `IdempotencyStore` позволяет подключить Redis без изменения бизнес-логики.

### Correlation ID

`correlationId` генерируется Producer-ом при создании события (или передаётся клиентом) и прокидывается в:

- RabbitMQ header `x-correlation-id`;
- поле `correlationId` в JSON-теле сообщения;
- все структурированные логи обоих сервисов.

По `correlationId` можно отследить путь события от HTTP-запроса до Telegram-уведомления.

## Troubleshooting

**Consumer не запускается (`connect ECONNREFUSED`)**

RabbitMQ ещё не готов. Consumer ретраит подключение до 10 раз с паузой 1 с. Если запускаете без Docker Compose — убедитесь, что RabbitMQ доступен по `RABBITMQ_URL`.

**`PRECONDITION_FAILED` при старте Consumer**

Queue или exchange уже существуют с другими параметрами. Удалите очереди через RabbitMQ Management UI (`http://localhost:15672`) или пересоздайте контейнер RabbitMQ:

```bash
docker compose down -v && docker compose up --build
```

**Telegram-уведомления не приходят**

Проверьте `TELEGRAM_BOT_TOKEN` и `TELEGRAM_DEFAULT_CHAT_ID`. Убедитесь, что бот добавлен в чат и имеет право на отправку сообщений. Consumer логирует причину ошибки (`status: telegram_retry` / `telegram_sent`).

**Сообщения попадают в DLQ**

Откройте RabbitMQ Management UI → Queues → `events.notification.dlq`. Сообщения в DLQ содержат header `x-error-message` с причиной. Для повторной обработки перенесите сообщения в основную очередь вручную через UI.
