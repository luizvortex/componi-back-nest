import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Component } from '../../database/entities/component.entity';
import { Follow } from '../../database/entities/follow.entity';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Component, Follow])],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
