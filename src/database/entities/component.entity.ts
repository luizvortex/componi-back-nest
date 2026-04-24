import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import type { ComponentVersion } from './component-version.entity';
import type { ComponentTag } from './component-tag.entity';
import type { Like } from './like.entity';
import type { Favorite } from './favorite.entity';
import type { Comment } from './comment.entity';
import type { CollectionComponent } from './collection-component.entity';
import type { Share } from './share.entity';

export type ComponentFramework = 'react' | 'vue' | 'svelte' | 'solid' | 'angular' | 'other';

/**
 * A component is the top-level artifact users create and share.
 * Code + dependencies live on `component_versions`; this row tracks the "current" version.
 */
@Entity({ name: 'components' })
@Index(['author', 'createdAt'])
@Index(['isPublic', 'createdAt'])
export class Component {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  authorId!: string;

  @ManyToOne(() => User, (u) => u.components, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author!: User;

  @Index()
  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', default: 'react' })
  framework!: ComponentFramework;

  @Column({ type: 'text', nullable: true })
  category!: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'boolean', default: true })
  isPublic!: boolean;

  @Column({ type: 'uuid', nullable: true })
  currentVersionId!: string | null;

  /** Component this one was forked from. Powers the "remix lineage" graph. */
  @Column({ type: 'uuid', nullable: true })
  forkedFromId!: string | null;

  @ManyToOne(() => Component, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'forkedFromId' })
  forkedFrom!: Component | null;

  @Column({ type: 'int', default: 0 })
  forksCount!: number;

  @Column({ type: 'int', default: 0 })
  likesCount!: number;

  @Column({ type: 'int', default: 0 })
  favoritesCount!: number;

  @Column({ type: 'int', default: 0 })
  commentsCount!: number;

  @Column({ type: 'int', default: 0 })
  viewsCount!: number;

  @Column({ type: 'int', default: 0 })
  sharesCount!: number;

  /**
   * Timestamp of the last semantic-embedding regeneration. The vector
   * itself is NOT declared on the entity — `components.embedding` is a
   * pgvector column read/written only via raw SQL from EmbeddingsService
   * and SemanticSearchService. Keeping it off the entity prevents
   * accidental inclusion in SELECTs (each row would carry 1.5 KB of
   * extra payload and blow our Supabase bandwidth budget).
   *
   * Null = embedding missing (new row, backfill pending, or failed
   * generation). Rows where `embeddingGeneratedAt < updatedAt` are
   * stale and picked up by the backfill cron.
   */
  @Column({ type: 'timestamptz', nullable: true })
  embeddingGeneratedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany('ComponentVersion', (v: ComponentVersion) => v.component)
  versions!: ComponentVersion[];

  @OneToMany('ComponentTag', (ct: ComponentTag) => ct.component)
  componentTags!: ComponentTag[];

  @OneToMany('Like', (l: Like) => l.component)
  likes!: Like[];

  @OneToMany('Favorite', (f: Favorite) => f.component)
  favorites!: Favorite[];

  @OneToMany('Comment', (c: Comment) => c.component)
  comments!: Comment[];

  @OneToMany('CollectionComponent', (cc: CollectionComponent) => cc.component)
  collectionComponents!: CollectionComponent[];

  @OneToMany('Share', (s: Share) => s.component)
  shares!: Share[];
}
