import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IdempotencyStore } from '@app/shared';

import { IDEMPOTENCY_DEFAULTS } from './idempotency.constants';

type StoredEvent = {
  expiresAt: number;
};

@Injectable()
export class InMemoryIdempotencyStore implements IdempotencyStore, OnModuleDestroy {
  private readonly processedEvents = new Map<string, StoredEvent>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.cleanupTimer = setInterval(() => this.cleanup(), this.getCleanupIntervalMs());
    this.cleanupTimer.unref();
  }

  async hasProcessed(eventId: string): Promise<boolean> {
    const storedEvent = this.processedEvents.get(eventId);

    if (!storedEvent) {
      return false;
    }

    if (storedEvent.expiresAt <= Date.now()) {
      this.processedEvents.delete(eventId);
      return false;
    }

    return true;
  }

  async markProcessed(eventId: string): Promise<void> {
    this.processedEvents.set(eventId, {
      expiresAt: Date.now() + this.getTtlMs(),
    });
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [eventId, storedEvent] of this.processedEvents.entries()) {
      if (storedEvent.expiresAt <= now) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  private getTtlMs(): number {
    return this.configService.get<number>('IDEMPOTENCY_TTL_MS', IDEMPOTENCY_DEFAULTS.ttlMs);
  }

  private getCleanupIntervalMs(): number {
    return this.configService.get<number>(
      'IDEMPOTENCY_CLEANUP_INTERVAL_MS',
      IDEMPOTENCY_DEFAULTS.cleanupIntervalMs,
    );
  }
}
