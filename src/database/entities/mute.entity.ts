import {
  Check,
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
 * Mute: one-way, silent filter.
 *
 * - Muter doesn't see muted's content in feed or notifications.
 * - Muted can still see/interact with muter's content normally.
 * - Muted is NEVER notified of the mute — that's the whole point.
 *
 * Lower-friction than block; used for "I don't want to see this person
 * in my feed but they're not a threat".
 */
@Entity({ name: 'mutes' })
@Index('UQ_mutes_pair', ['muterId', 'mutedId'], { unique: true })
@Check('CHK_mutes_self', '"muterId" <> "mutedId"')
export class Mute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  muterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'muterId' })
  muter!: User;

  @Column({ type: 'uuid' })
  mutedId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mutedId' })
  muted!: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
