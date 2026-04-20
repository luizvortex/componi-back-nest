import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import { ComponentsService } from './components.service';
import { ComponentsController } from './components.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Component, ComponentVersion])],
  controllers: [ComponentsController],
  providers: [ComponentsService],
  exports: [ComponentsService],
})
export class ComponentsModule {}
