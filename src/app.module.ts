import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { configurations } from './config';
import { envValidationSchema } from './config/env.validation';
import { typeOrmConfigFactory } from './database/data-source';
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';
import { RedisModule } from './common/redis/redis.module';
import { CacheModule } from './common/cache/cache.module';
import { QueueModule } from './common/queue/queue.module';
import { SessionModule } from './common/session/session.module';
import { AuditModule } from './common/audit/audit.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { UserAwareThrottlerGuard } from './common/throttler/user-aware-throttler.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ComponentsModule } from './modules/components/components.module';
import { VersionsModule } from './modules/versions/versions.module';
import { TagsModule } from './modules/tags/tags.module';
import { SocialModule } from './modules/social/social.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { FeedModule } from './modules/feed/feed.module';
import { SearchModule } from './modules/search/search.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configurations,
      envFilePath: ['.env.local', '.env'],
      // Boot-time env validation. Missing/typo'd vars fail the process
      // with a readable error instead of surfacing as runtime undefineds.
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: typeOrmConfigFactory,
    }),
    RedisModule,
    CacheModule,
    QueueModule,
    SessionModule,
    AuditModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        // Tiered limits: short burst (10s), medium (1m), long (1h).
        // A burst attack trips 'short' first; sustained scraping hits 'long'.
        throttlers: [
          {
            name: 'short',
            ttl: 10_000,
            limit: parseInt(process.env.THROTTLE_SHORT_LIMIT ?? '20', 10),
            blockDuration: 10_000,
          },
          {
            name: 'medium',
            ttl: (config.get<number>('app.throttle.ttl', 60) ?? 60) * 1000,
            limit: config.get<number>('app.throttle.limit', 100),
            blockDuration: 60_000,
          },
          {
            name: 'long',
            ttl: 3_600_000,
            limit: parseInt(process.env.THROTTLE_LONG_LIMIT ?? '2000', 10),
            blockDuration: 5 * 60_000,
          },
        ],
        storage,
      }),
    }),
    AuthModule,
    UsersModule,
    ComponentsModule,
    VersionsModule,
    TagsModule,
    SocialModule,
    CommentsModule,
    CollectionsModule,
    FeedModule,
    SearchModule,
    NotificationsModule,
    ModerationModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Expose the Redis-backed storage so ThrottlerModule's async factory
    // can inject it — throttler v6 dropped `extraProviders`.
    RedisThrottlerStorage,
    // Auth guard runs first so @OptionalAuth populates req.user for the
    // throttler, letting it key by userId instead of IP.
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
  ],
})
export class AppModule {}
