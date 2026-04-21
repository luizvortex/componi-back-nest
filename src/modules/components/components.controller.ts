import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateComponentDto } from './dto/create-component.dto';
import { ForkComponentDto } from './dto/fork-component.dto';
import { ListComponentsDto } from './dto/list-components.dto';
import { SetThumbnailDto } from './dto/set-thumbnail.dto';
import { UpdateComponentDto } from './dto/update-component.dto';
import { ComponentsService } from './components.service';

@ApiTags('components')
@ApiBearerAuth()
@Controller('components')
export class ComponentsController {
  constructor(private readonly service: ComponentsService) {}

  @OptionalAuth()
  @Get()
  list(@Query() query: ListComponentsDto, @CurrentUser() user?: AuthUser) {
    return this.service.list(query, user);
  }

  @OptionalAuth()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.findById(id, user);
  }

  @OptionalAuth()
  @Get(':id/lineage')
  lineage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.lineage(id, user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComponentDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/fork')
  fork(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ForkComponentDto,
  ) {
    return this.service.fork(id, user, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateComponentDto,
  ) {
    return this.service.update(id, user, dto);
  }

  @Patch(':id/thumbnail')
  setThumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetThumbnailDto,
  ) {
    return this.service.setThumbnail(id, user, dto.thumbnailUrl);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
