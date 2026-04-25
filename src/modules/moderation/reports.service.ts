import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { Comment } from '../../database/entities/comment.entity';
import { Component } from '../../database/entities/component.entity';
import {
  Report,
  ReportTargetType,
} from '../../database/entities/report.entity';
import { User } from '../../database/entities/user.entity';
import { CreateReportDto } from './dto/create-report.dto';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * User-facing report intake. The admin-facing operations (list queue,
 * resolve, take action) live in AdminReportsService — different security
 * surface, different concerns.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
  ) {}

  async create(reporterId: string, dto: CreateReportDto): Promise<Report> {
    // Validate the target actually exists (and isn't a self-report on a
    // user). Cheap check now beats a useless audit row later.
    const exists = await this.targetExists(dto.targetType, dto.targetId);
    if (!exists) {
      throw new NotFoundException('Target not found');
    }
    if (dto.targetType === 'user' && dto.targetId === reporterId) {
      throw new BadRequestException('Cannot report yourself');
    }

    try {
      return await this.reports.save(
        this.reports.create({
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          details: dto.details?.trim() || null,
          status: 'open',
          actionTaken: 'none',
        }),
      );
    } catch (err) {
      // Partial unique index UQ_reports_open_per_reporter — one open
      // report per (reporter, target). Reopen is allowed once resolved.
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'You already have an open report for this target',
        );
      }
      throw err;
    }
  }

  /** Reporter's own filed reports — for a "my reports" page. */
  listMine(reporterId: string): Promise<Report[]> {
    return this.reports.find({
      where: { reporterId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  private async targetExists(
    type: ReportTargetType,
    id: string,
  ): Promise<boolean> {
    switch (type) {
      case 'user': {
        const u = await this.users.findOne({
          where: { id },
          select: { id: true, deletedAt: true },
        });
        return !!u && !u.deletedAt;
      }
      case 'component': {
        const c = await this.components.findOne({
          where: { id },
          select: { id: true, deletedAt: true },
        });
        return !!c && !c.deletedAt;
      }
      case 'comment': {
        const c = await this.comments.findOne({
          where: { id },
          select: { id: true, deletedAt: true },
        });
        return !!c && !c.deletedAt;
      }
    }
  }
}
