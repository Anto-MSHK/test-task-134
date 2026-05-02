# Event Notification Platform

NestJS monorepo for an event notification platform with a Producer service, Consumer service, shared event contract, and RabbitMQ infrastructure.

## Local Development

```bash
npm install
cp .env.example .env
npm run build
npm run start:producer:dev
npm run start:consumer:dev
```

Producer health endpoint:

```bash
curl http://localhost:3000/health
```

Consumer health endpoint:

```bash
curl http://localhost:3001/health
```

Publish an event:

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

## Docker

Start RabbitMQ only:

```bash
docker compose up rabbitmq
```

RabbitMQ Management UI is available at `http://localhost:15672` with the default `guest` / `guest` credentials.

Start all services:

```bash
docker compose up --build
```

## Configuration

All environment variables are described in `.env.example`. Key knobs:

- `RABBITMQ_URL`, `RABBITMQ_EXCHANGE`, `RABBITMQ_ROUTING_KEY`, `RABBITMQ_QUEUE`, `RABBITMQ_RETRY_QUEUE`, `RABBITMQ_DLQ`, `RABBITMQ_PREFETCH` — broker topology.
- `MAX_RETRY_ATTEMPTS`, `RETRY_DELAY_MS` — Producer publisher retry policy (exponential backoff base).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_CHAT_ID` — reserved for Phase 6.
