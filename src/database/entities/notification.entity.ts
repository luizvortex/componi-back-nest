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

export type NotificationType =
  | 'like'
  | 'favorite'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'mention'
  | 'version';

@Entity({ name: 'notifications' })
@Index(['userId', 'createdAt'])
@Index(['userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (u) => u.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'text' })
  type!: NotificationType;

  /** Opaque payload: component ids, comment ids, etc. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
