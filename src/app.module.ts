import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { configurations } from './config';
import { typeOrmConfigFactory } from './database/data-source';
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configurations,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: typeOrmConfigFactory,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('app.throttle.ttl', 60) * 1000,
          limit: config.get<number>('app.throttle.limit', 100),
        },
      ],
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
  ],
})
export class AppModule {}
