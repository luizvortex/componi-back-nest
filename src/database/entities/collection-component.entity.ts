import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Collection } from './collection.entity';
import { Component } from './component.entity';

@Entity({ name: 'collection_components' })
export class CollectionComponent {
  @PrimaryColumn({ type: 'uuid' })
  collectionId!: string;

  @PrimaryColumn({ type: 'uuid' })
  componentId!: string;

  @ManyToOne(() => Collection, (c) => c.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectionId' })
  collection!: Collection;

  @ManyToOne(() => Component, (c) => c.collectionComponents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'componentId' })
  component!: Component;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
