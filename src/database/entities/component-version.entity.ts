import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Component } from './component.entity';

/**
 * Each published iteration of a component. The preview renders the latest
 * (or an explicitly requested) version's `code` + `dependencies` on the client.
 */
@Entity({ name: 'component_versions' })
@Unique('uq_component_version', ['componentId', 'version'])
@Index(['componentId', 'createdAt'])
export class ComponentVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  componentId!: string;

  @ManyToOne(() => Component, (c) => c.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'componentId' })
  component!: Component;

  /** Monotonic version number scoped per component (v1, v2, …). */
  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'text' })
  code!: string;

  /** Map of package → semver range, e.g. { "framer-motion": "^11.0.0" }. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  dependencies!: Record<string, string>;

  /** Optional entry-point filename, defaults to App.tsx on the client. */
  @Column({ type: 'text', nullable: true })
  entryFile!: string | null;

  @Column({ type: 'text', nullable: true })
  changelog!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
