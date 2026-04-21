import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionsService } from './collections.service';

@ApiTags('collections')
@ApiBearerAuth()
@Controller('collections')
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listForUser(user.id);
  }

  @OptionalAuth()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCollectionDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/components/:componentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  addComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addComponent(id, componentId, user);
  }

  @Delete(':id/components/:componentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeComponent(id, componentId, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
