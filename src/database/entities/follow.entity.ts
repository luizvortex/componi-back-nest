import { Check, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'follows' })
@Check('chk_follow_not_self', '"followerId" <> "followeeId"')
export class Follow {
  @PrimaryColumn({ type: 'uuid' })
  followerId!: string;

  @PrimaryColumn({ type: 'uuid' })
  followeeId!: string;

  @ManyToOne(() => User, (u) => u.following, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followerId' })
  follower!: User;

  @ManyToOne(() => User, (u) => u.followers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followeeId' })
  followee!: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
