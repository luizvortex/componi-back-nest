import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Block } from '../../database/entities/block.entity';
import { Mute } from '../../database/entities/mute.entity';
import { Follow } from '../../database/entities/follow.entity';
import { Comment } from '../../database/entities/comment.entity';
import { Component } from '../../database/entities/component.entity';
import { Report } from '../../database/entities/report.entity';
import { User } from '../../database/entities/user.entity';
import { BlocksService } from './blocks.service';
import { MutesService } from './mutes.service';
import { ReportsService } from './reports.service';
import { ModerationController } from './moderation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Block, Mute, Follow, User, Component, Comment, Report]),
  ],
  controllers: [ModerationController],
  providers: [BlocksService, MutesService, ReportsService],
  // Exported so the social/feed/components services can consume
  // `BlocksService.isBlockedEitherWay()` for visibility filtering in
  // the next etapa, and so AdminModule can reuse ReportsService.
  exports: [BlocksService, MutesService, ReportsService],
})
export class ModerationModule {}
