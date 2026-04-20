import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Component, ComponentVersion])],
  controllers: [VersionsController],
  providers: [VersionsService],
  exports: [VersionsService],
})
export class VersionsModule {}
