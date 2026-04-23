import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Component } from './component.entity';
import type { Comment } from './comment.entity';
import type { Like } from './like.entity';
import type { Favorite } from './favorite.entity';
import type { Follow } from './follow.entity';
import type { Collection } from './collection.entity';
import type { Share } from './share.entity';
import type { Notification } from './notification.entity';

/**
 * Users are provisioned from Supabase Auth. `id` mirrors `auth.users.id` (uuid).
 * Profile fields are synced from the GitHub OAuth provider.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  email!: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  username!: string;

  @Column({ type: 'text', nullable: true })
  githubUsername!: string | null;

  @Column({ type: 'text', nullable: true })
  displayName!: string | null;

  @Column({ type: 'text', nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ type: 'text', nullable: true })
  websiteUrl!: string | null;

  @Column({ type: 'int', default: 0 })
  followersCount!: number;

  @Column({ type: 'int', default: 0 })
  followingCount!: number;

  @Column({ type: 'int', default: 0 })
  componentsCount!: number;

  /**
   * Authorization role. Default `'user'`. Elevation to `'moderator'` or
   * `'admin'` is NEVER done via API — only via the `admin:promote` CLI
   * script (which requires ADMIN_BOOTSTRAP_SECRET) or direct DB access.
   * A DB CHECK constraint enforces the allowed values, and RLS blocks
   * UPDATEs to this column so even a compromised service_role key
   * cannot self-escalate without going through the DBA.
   */
  @Column({ type: 'text', default: 'user' })
  role!: 'user' | 'moderator' | 'admin';

  /**
   * When set and in the future, the user's JWT is rejected at the guard
   * layer and they cannot interact. Cleared on unsuspend. Permanent bans
   * use a far-future date (year 9999) + `suspensionReason`.
   */
  @Column({ type: 'timestamptz', nullable: true })
  suspendedUntil!: Date | null;

  @Column({ type: 'text', nullable: true })
  suspensionReason!: string | null;

  /**
   * Consent ledger. A null here means the user hasn't yet accepted the
   * current policy revision — the frontend should prompt on next login.
   * Version strings mirror the `Version:` header in docs/PRIVACY.md and
   * docs/TERMS.md and are sourced from config.compliance.
   */
  @Column({ type: 'timestamptz', nullable: true })
  privacyAcceptedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  privacyAcceptedVersion!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  termsAcceptedVersion!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany('Component', (c: Component) => c.author)
  components!: Component[];

  @OneToMany('Comment', (c: Comment) => c.author)
  comments!: Comment[];

  @OneToMany('Like', (l: Like) => l.user)
  likes!: Like[];

  @OneToMany('Favorite', (f: Favorite) => f.user)
  favorites!: Favorite[];

  @OneToMany('Follow', (f: Follow) => f.follower)
  following!: Follow[];

  @OneToMany('Follow', (f: Follow) => f.followee)
  followers!: Follow[];

  @OneToMany('Collection', (c: Collection) => c.owner)
  collections!: Collection[];

  @OneToMany('Share', (s: Share) => s.user)
  shares!: Share[];

  @OneToMany('Notification', (n: Notification) => n.user)
  notifications!: Notification[];
}
