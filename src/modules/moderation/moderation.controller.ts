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
import type { AuthUser } from '../../common/types/auth-user.type';
import { BlocksService } from './blocks.service';
import { MutesService } from './mutes.service';
import { ReportsService } from './reports.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { CreateReportDto } from './dto/create-report.dto';

/**
 * All endpoints here are self-scoped — the caller can only mutate their
 * own block/mute lists. There's no "list someone else's blocks" or
 * "unblock someone else" surface: those would be either privacy leaks
 * or ways for one user to override another's moderation choices.
 */
@ApiTags('moderation')
@ApiBearerAuth()
@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly blocks: BlocksService,
    private readonly mutes: MutesService,
    private readonly reports: ReportsService,
  ) {}

  // ── blocks ────────────────────────────────────────────────────────────

  @Get('blocks')
  listBlocks(@CurrentUser() user: AuthUser) {
    return this.blocks.listForBlocker(user.id);
  }

  @Post('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  block(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) targetId: string,
    @Body() dto: CreateBlockDto,
  ) {
    return this.blocks.block(user.id, targetId, dto.reason);
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ) {
    return this.blocks.unblock(user.id, targetId);
  }

  // ── mutes ─────────────────────────────────────────────────────────────

  @Get('mutes')
  listMutes(@CurrentUser() user: AuthUser) {
    return this.mutes.listForMuter(user.id);
  }

  @Post('mutes/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  mute(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ) {
    return this.mutes.mute(user.id, targetId);
  }

  @Delete('mutes/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unmute(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ) {
    return this.mutes.unmute(user.id, targetId);
  }

  // ── reports (intake) ──────────────────────────────────────────────────
  // The admin-facing report queue lives at /admin/reports.

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  report(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user.id, dto);
  }

  @Get('reports/mine')
  myReports(@CurrentUser() user: AuthUser) {
    return this.reports.listMine(user.id);
  }
}
