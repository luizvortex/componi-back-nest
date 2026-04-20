import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { PublishVersionDto } from './dto/publish-version.dto';
import { VersionsService } from './versions.service';

@ApiTags('versions')
@ApiBearerAuth()
@Controller('components/:componentId/versions')
export class VersionsController {
  constructor(private readonly service: VersionsService) {}

  @Public()
  @Get()
  list(
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.list(componentId, user);
  }

  @Public()
  @Get(':version')
  findOne(
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.findOne(componentId, version, user);
  }

  @Post()
  publish(
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PublishVersionDto,
  ) {
    return this.service.publish(componentId, user, dto);
  }
}
