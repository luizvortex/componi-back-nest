import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Component } from './component.entity';
import { User } from './user.entity';

@Entity({ name: 'favorites' })
@Index('IDX_favorites_component', ['componentId'])
export class Favorite {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'uuid' })
  componentId!: string;

  @ManyToOne(() => User, (u) => u.favorites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => Component, (c) => c.favorites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'componentId' })
  component!: Component;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
