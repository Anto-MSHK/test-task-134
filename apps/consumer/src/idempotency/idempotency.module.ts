import { Module } from '@nestjs/common';

import { IDEMPOTENCY_STORE } from './idempotency.constants';
import { InMemoryIdempotencyStore } from './in-memory-idempotency.store';

@Module({
  providers: [
    InMemoryIdempotencyStore,
    {
      provide: IDEMPOTENCY_STORE,
      useExisting: InMemoryIdempotencyStore,
    },
  ],
  exports: [IDEMPOTENCY_STORE],
})
export class IdempotencyModule {}
