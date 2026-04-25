import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export type ReportTargetType = 'component' | 'comment' | 'user';
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'malicious_code'
  | 'copyright'
  | 'nsfw'
  | 'impersonation'
  | 'other';
export type ReportAction =
  | 'none'
  | 'warned'
  | 'content_removed'
  | 'user_suspended'
  | 'user_banned';

/**
 * Abuse / policy-violation reports.
 *
 * `targetId` has no FK because it points to one of three tables depending
 * on `targetType`. Validation lives in the service (reject if target is
 * deleted or doesn't exist). Deduped per-reporter by (reporterId, targetType,
 * targetId) partial unique index on status='open' — a reporter can re-open
 * after their previous report is resolved.
 */
@Entity({ name: 'reports' })
@Index('IDX_reports_status_created', ['status', 'createdAt'])
@Index('IDX_reports_target', ['targetType', 'targetId', 'status'])
@Index('IDX_reports_reporter', ['reporterId', 'createdAt'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  reporterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporterId' })
  reporter!: User;

  @Column({ type: 'text' })
  targetType!: ReportTargetType;

  @Column({ type: 'uuid' })
  targetId!: string;

  @Column({ type: 'text' })
  reason!: ReportReason;

  /** Free-form context from the reporter. Capped at 2000 chars in DTO. */
  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @Column({ type: 'text', default: 'open' })
  status!: ReportStatus;

  /** Admin who closed the report. */
  @Column({ type: 'uuid', nullable: true })
  resolvedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy!: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote!: string | null;

  @Column({ type: 'text', default: 'none' })
  actionTaken!: ReportAction;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
