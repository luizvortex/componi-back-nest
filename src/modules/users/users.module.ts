import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Block } from '../../database/entities/block.entity';
import { Collection } from '../../database/entities/collection.entity';
import { CollectionComponent } from '../../database/entities/collection-component.entity';
import { Comment } from '../../database/entities/comment.entity';
import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import { Favorite } from '../../database/entities/favorite.entity';
import { Follow } from '../../database/entities/follow.entity';
import { Like } from '../../database/entities/like.entity';
import { Mute } from '../../database/entities/mute.entity';
import { Notification } from '../../database/entities/notification.entity';
import { Report } from '../../database/entities/report.entity';
import { Share } from '../../database/entities/share.entity';
import { User } from '../../database/entities/user.entity';
import { AccountPrivacyService } from './account-privacy.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Component,
      ComponentVersion,
      Comment,
      Like,
      Favorite,
      Follow,
      Block,
      Mute,
      Notification,
      Collection,
      CollectionComponent,
      Share,
      Report,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, AccountPrivacyService],
  exports: [UsersService],
})
export class UsersModule {}
