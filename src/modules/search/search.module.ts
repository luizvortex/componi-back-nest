import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Component } from '../../database/entities/component.entity';
import { User } from '../../database/entities/user.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SemanticSearchService } from './semantic-search.service';

@Module({
  imports: [TypeOrmModule.forFeature([Component, User])],
  controllers: [SearchController],
  providers: [SearchService, SemanticSearchService],
})
export class SearchModule {}
