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
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateComponentDto } from './dto/create-component.dto';
import { ListComponentsDto } from './dto/list-components.dto';
import { UpdateComponentDto } from './dto/update-component.dto';
import { ComponentsService } from './components.service';

@ApiTags('components')
@ApiBearerAuth()
@Controller('components')
export class ComponentsController {
  constructor(private readonly service: ComponentsService) {}

  @Public()
  @Get()
  list(@Query() query: ListComponentsDto, @CurrentUser() user?: AuthUser) {
    return this.service.list(query, user);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.findById(id, user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComponentDto) {
    return this.service.create(user, dto);
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
    @Body('thumbnailUrl') thumbnailUrl: string,
  ) {
    return this.service.setThumbnail(id, user, thumbnailUrl);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
