import { ConfigService } from '@nestjs/config';

import { InMemoryIdempotencyStore } from './in-memory-idempotency.store';

describe(InMemoryIdempotencyStore.name, () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns false for an event that was never processed', async () => {
    const store = createStore();

    await expect(store.hasProcessed('event-1')).resolves.toBe(false);

    store.onModuleDestroy();
  });

  it('returns true for a processed event', async () => {
    const store = createStore();

    await store.markProcessed('event-1');

    await expect(store.hasProcessed('event-1')).resolves.toBe(true);

    store.onModuleDestroy();
  });

  it('tracks multiple distinct events independently', async () => {
    const store = createStore();

    await store.markProcessed('event-1');
    await store.markProcessed('event-2');

    await expect(store.hasProcessed('event-1')).resolves.toBe(true);
    await expect(store.hasProcessed('event-2')).resolves.toBe(true);
    await expect(store.hasProcessed('event-3')).resolves.toBe(false);

    store.onModuleDestroy();
  });

  it('expires processed events after TTL', async () => {
    jest.useFakeTimers();
    const ttlMs = 1000;
    const store = createStore({ ttlMs });

    await store.markProcessed('event-1');

    await expect(store.hasProcessed('event-1')).resolves.toBe(true);

    jest.advanceTimersByTime(ttlMs + 1);

    await expect(store.hasProcessed('event-1')).resolves.toBe(false);

    store.onModuleDestroy();
  });

  it('does not expire events before TTL elapses', async () => {
    jest.useFakeTimers();
    const ttlMs = 5000;
    const store = createStore({ ttlMs });

    await store.markProcessed('event-1');

    jest.advanceTimersByTime(ttlMs - 1);

    await expect(store.hasProcessed('event-1')).resolves.toBe(true);

    store.onModuleDestroy();
  });

  it('clears the cleanup timer on module destroy', () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const store = createStore();

    store.onModuleDestroy();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});

function createStore(
  options: { ttlMs?: number; cleanupIntervalMs?: number } = {},
): InMemoryIdempotencyStore {
  const configService = {
    get: jest.fn((key: string, defaultValue: unknown) => {
      if (key === 'IDEMPOTENCY_TTL_MS') {
        return options.ttlMs ?? 86400000;
      }

      if (key === 'IDEMPOTENCY_CLEANUP_INTERVAL_MS') {
        return options.cleanupIntervalMs ?? 60000;
      }

      return defaultValue;
    }),
  } as unknown as ConfigService;

  return new InMemoryIdempotencyStore(configService);
}
