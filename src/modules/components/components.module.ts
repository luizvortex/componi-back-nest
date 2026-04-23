import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import { ComponentTag } from '../../database/entities/component-tag.entity';
import { Tag } from '../../database/entities/tag.entity';
import { User } from '../../database/entities/user.entity';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ComponentsService } from './components.service';
import { ComponentsController } from './components.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Component, ComponentVersion, ComponentTag, Tag, User]),
    ModerationModule,
    NotificationsModule,
  ],
  controllers: [ComponentsController],
  providers: [ComponentsService],
  exports: [ComponentsService],
})
export class ComponentsModule {}
