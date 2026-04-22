import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Append-only audit trail for privileged actions (admin/moderator).
 *
 * This table is CRITICAL for compliance (LGPD Art. 37 — "registro das
 * operações de tratamento") and forensics. It must be treated as
 * write-once: RLS in supabase/rls.sql blocks UPDATE and DELETE for
 * EVERY role, including service_role. The only ways to mutate it are:
 *   1. Revoking RLS manually (requires DBA + audit on Supabase side)
 *   2. Retention policy TRUNCATE after N years (compliance-driven)
 *
 * Never log raw PII here — use the `metadata` jsonb for structured
 * references (user id, component id) rather than names/emails.
 */
@Entity({ name: 'audit_logs' })
@Index('IDX_audit_actor_created', ['actorId', 'createdAt'])
@Index('IDX_audit_target', ['targetType', 'targetId', 'createdAt'])
@Index('IDX_audit_action_created', ['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The admin/moderator who performed the action. */
  @Column({ type: 'uuid' })
  actorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actorId' })
  actor!: User;

  /** Machine-readable verb, e.g. 'resolve_report', 'suspend_user'. */
  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text', nullable: true })
  targetType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  targetId!: string | null;

  /** Structured context. Never put PII here — use IDs. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  /** Required for sensitive destructive actions (enforced in service). */
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
