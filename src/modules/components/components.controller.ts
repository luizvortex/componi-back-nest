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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateComponentDto } from './dto/create-component.dto';
import { ForkComponentDto } from './dto/fork-component.dto';
import { ListComponentsDto } from './dto/list-components.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
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

  // NOTE: declared before :id so Express doesn’t treat "drafts" as a UUID.
  @Get('drafts')
  @ApiOperation({ summary: 'List all drafts owned by the current user' })
  listDrafts(@CurrentUser() user: AuthUser) {
    return this.service.listDrafts(user);
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

  /**
   * Auto-save for the inline editor. All fields optional — send only
   * what changed. Code is written in-place on the current version (no
   * new version created). Returns 400 if the component is already
   * published; use PATCH /:id + POST /:id/versions instead.
   */
  @Patch(':id/draft')
  @ApiOperation({ summary: 'Auto-save a draft (all fields optional, code updated in-place)' })
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveDraftDto,
  ) {
    return this.service.saveDraft(id, user, dto);
  }

  /** Transitions a draft to published. Makes it visible in feeds. */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a draft — makes it visible in feeds' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.publish(id, user);
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
