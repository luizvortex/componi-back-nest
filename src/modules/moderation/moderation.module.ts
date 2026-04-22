import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Block } from '../../database/entities/block.entity';
import { Mute } from '../../database/entities/mute.entity';
import { Follow } from '../../database/entities/follow.entity';
import { User } from '../../database/entities/user.entity';
import { BlocksService } from './blocks.service';
import { MutesService } from './mutes.service';
import { ModerationController } from './moderation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Block, Mute, Follow, User])],
  controllers: [ModerationController],
  providers: [BlocksService, MutesService],
  // Exported so the social/feed/components services can consume
  // `BlocksService.isBlockedEitherWay()` for visibility filtering in
  // the next etapa.
  exports: [BlocksService, MutesService],
})
export class ModerationModule {}
