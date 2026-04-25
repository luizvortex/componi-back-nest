import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Report, ReportStatus } from '../../database/entities/report.entity';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { ResolveReportDto } from './dto/resolve-report.dto';

@Injectable()
export class AdminReportsService {
  constructor(
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Paginated queue for moderators. Default ordering puts oldest open
   * reports first so nothing rots at the bottom of a stack.
   */
  list(opts: {
    status?: ReportStatus;
    limit?: number;
    cursor?: string;
  }): Promise<Report[]> {
    const qb = this.reports
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reporter', 'reporter')
      .orderBy('r.createdAt', 'ASC')
      .addOrderBy('r.id', 'ASC')
      .take(Math.min(Math.max(opts.limit ?? 50, 1), 200));

    if (opts.status) {
      qb.andWhere('r.status = :status', { status: opts.status });
    } else {
      qb.andWhere(`r.status IN ('open', 'reviewing')`);
    }

    if (opts.cursor) {
      qb.andWhere('r.id > :cursor', { cursor: opts.cursor });
    }

    return qb.getMany();
  }

  findById(id: string): Promise<Report> {
    return this.reports
      .findOneOrFail({
        where: { id },
        relations: { reporter: true, resolvedBy: true },
      })
      .catch(() => {
        throw new NotFoundException('Report not found');
      });
  }

  /**
   * Mark "in review" so two moderators don't grab the same report.
   * No audit row — this is a UI-state mutation, not a moderation decision.
   */
  async claim(id: string, moderatorId: string): Promise<void> {
    const result = await this.reports.update(
      { id, status: 'open' },
      { status: 'reviewing', resolvedById: moderatorId },
    );
    if (!result.affected) {
      throw new NotFoundException('Report not found or already in progress');
    }
  }

  /**
   * Final resolution. The actual destructive work (delete content,
   * suspend user) is performed by the caller — this method only updates
   * the report row and writes the audit entry. Splitting the concerns
   * keeps each audit row tied to one observable change.
   */
  async resolve(
    ctx: AuditContext,
    id: string,
    dto: ResolveReportDto,
  ): Promise<Report> {
    const report = await this.findById(id);

    report.status = dto.status;
    report.actionTaken = dto.actionTaken;
    report.resolutionNote = dto.resolutionNote.trim();
    report.resolvedById = ctx.actorId;
    report.resolvedAt = new Date();
    const saved = await this.reports.save(report);

    await this.audit.log(ctx, {
      action: 'resolve_report',
      targetType: 'report',
      targetId: id,
      reason: dto.resolutionNote,
      metadata: {
        status: dto.status,
        actionTaken: dto.actionTaken,
        targetType: report.targetType,
        targetId: report.targetId,
        publicReason: dto.publicReason ?? null,
      },
    });

    return saved;
  }
}
