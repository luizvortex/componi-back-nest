import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Like } from '../../database/entities/like.entity';
import { Favorite } from '../../database/entities/favorite.entity';
import { Follow } from '../../database/entities/follow.entity';
import { Component } from '../../database/entities/component.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Like, Favorite, Follow, Component, User]),
    NotificationsModule,
  ],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
