import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Component } from './component.entity';
import { Tag } from './tag.entity';

@Entity({ name: 'component_tags' })
export class ComponentTag {
  @PrimaryColumn({ type: 'uuid' })
  componentId!: string;

  @PrimaryColumn({ type: 'uuid' })
  tagId!: string;

  @ManyToOne(() => Component, (c) => c.componentTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'componentId' })
  component!: Component;

  @ManyToOne(() => Tag, (t) => t.componentTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tagId' })
  tag!: Tag;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
