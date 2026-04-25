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
 * Block: bidirectional visibility wall between two users.
 *
 * Semantics enforced in the service layer:
 * - Blocker doesn't see blocked's content anywhere (feed, list, detail, search).
 * - Blocked also can't see blocker's content (symmetric hide from one-way
 *   initiative). Following Twitter/Instagram — asymmetric blocks would
 *   let the blocker keep harassing from behind a mute.
 * - Neither side can like/comment/fork/follow the other while a block exists.
 * - Existing follows in either direction are deleted on block.
 *
 * Heavier moderation (content takedown, suspension) goes through `reports`.
 */
@Entity({ name: 'blocks' })
@Index('UQ_blocks_pair', ['blockerId', 'blockedId'], { unique: true })
@Index('IDX_blocks_blocked', ['blockedId'])
@Check('CHK_blocks_self', '"blockerId" <> "blockedId"')
export class Block {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  blockerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blockerId' })
  blocker!: User;

  @Column({ type: 'uuid' })
  blockedId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blockedId' })
  blocked!: User;

  /** Optional private note for the blocker ("why did I block this person?"). */
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
