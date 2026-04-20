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
