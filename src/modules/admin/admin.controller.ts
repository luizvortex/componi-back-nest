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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user.type';
import type { ReportStatus } from '../../database/entities/report.entity';
import { AdminReportsService } from './admin-reports.service';
import { AdminUsersService } from './admin-users.service';
import { AdminContentService } from './admin-content.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import {
  DeleteContentDto,
  PromoteRoleDto,
  SuspendUserDto,
} from './dto/suspend-user.dto';

/**
 * Class-level `@Roles('moderator')` is the floor — every endpoint here
 * requires at least moderator. Endpoints that need full admin (role
 * promotion, permanent ban, hard-delete user) override with
 * `@Roles('admin')` per-handler.
 *
 * RolesGuard is bound at the class level too so the global APP_GUARD
 * order doesn't matter — even if SupabaseAuthGuard ran first elsewhere,
 * /admin/* always re-checks the role.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('moderator')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly reports: AdminReportsService,
    private readonly users: AdminUsersService,
    private readonly content: AdminContentService,
  ) {}

  // ── reports queue ─────────────────────────────────────────────────────

  @Get('reports')
  listReports(
    @Query('status') status?: ReportStatus,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reports.list({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  @Get('reports/:id')
  getReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.findById(id);
  }

  @Post('reports/:id/claim')
  @HttpCode(HttpStatus.NO_CONTENT)
  claimReport(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.claim(id, user.id);
  }

  @Patch('reports/:id/resolve')
  resolveReport(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.reports.resolve(
      AuditService.contextFromRequest(user, req),
      id,
      dto,
    );
  }

  // ── content takedown ──────────────────────────────────────────────────

  @Delete('components/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComponent(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteContentDto,
  ) {
    return this.content.deleteComponent(
      AuditService.contextFromRequest(user, req),
      id,
      dto.reason,
      dto.reportId,
    );
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteContentDto,
  ) {
    return this.content.deleteComment(
      AuditService.contextFromRequest(user, req),
      id,
      dto.reason,
      dto.reportId,
    );
  }

  // ── user moderation ───────────────────────────────────────────────────

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspendUser(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.users.suspend(
      AuditService.contextFromRequest(user, req),
      user.role,
      id,
      dto.hours,
      dto.reason,
    );
  }

  @Post('users/:id/unsuspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsuspendUser(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { reason: string },
  ) {
    return this.users.unsuspend(
      AuditService.contextFromRequest(user, req),
      id,
      dto.reason,
    );
  }

  /**
   * Role promotion / demotion. Full admin only — moderators can suspend
   * but not change the staff roster.
   */
  @Roles('admin')
  @Patch('users/:id/role')
  setRole(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromoteRoleDto,
  ) {
    return this.users.setRole(
      AuditService.contextFromRequest(user, req),
      id,
      dto.role,
      dto.reason,
    );
  }
}
