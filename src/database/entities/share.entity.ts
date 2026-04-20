import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Component } from './component.entity';
import { User } from './user.entity';

export type ShareChannel = 'link' | 'twitter' | 'reddit' | 'embed' | 'other';

@Entity({ name: 'shares' })
@Index(['componentId', 'createdAt'])
export class Share {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  componentId!: string;

  @ManyToOne(() => Component, (c) => c.shares, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'componentId' })
  component!: Component;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, (u) => u.shares, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  @Column({ type: 'text', default: 'link' })
  channel!: ShareChannel;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
