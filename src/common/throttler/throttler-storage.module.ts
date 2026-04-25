import { Global, Module } from '@nestjs/common';

import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Hosts the throttler storage as a global provider so
 * ThrottlerModule.forRootAsync's `inject` resolves it before the
 * AppModule's own providers list is processed. Without this, async
 * factories that ran during the imports phase couldn't find
 * RedisThrottlerStorage and the boot threw an UnknownDependencies
 * error from the offline OpenAPI generation path.
 */
@Global()
@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}
