import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Comment } from '../../database/entities/comment.entity';
import { Component } from '../../database/entities/component.entity';
import { Report } from '../../database/entities/report.entity';
import { ModerationModule } from '../moderation/moderation.module';
import { AdminController } from './admin.controller';
import { AdminContentService } from './admin-content.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminUsersService } from './admin-users.service';

/**
 * Staff-only module. Every endpoint goes through RolesGuard with at
 * least @Roles('moderator'); some require admin. AuditService is
 * global so we don't import it here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Component, Comment, Report]),
    ModerationModule, // for ReportsService re-use if we expand later
  ],
  controllers: [AdminController],
  providers: [AdminReportsService, AdminUsersService, AdminContentService],
})
export class AdminModule {}
