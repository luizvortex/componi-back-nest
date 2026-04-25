import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { Component } from './entities/component.entity';
import { ComponentVersion } from './entities/component-version.entity';
import { Tag } from './entities/tag.entity';
import { ComponentTag } from './entities/component-tag.entity';
import { Like } from './entities/like.entity';
import { Favorite } from './entities/favorite.entity';
import { Comment } from './entities/comment.entity';
import { Follow } from './entities/follow.entity';
import { Collection } from './entities/collection.entity';
import { CollectionComponent } from './entities/collection-component.entity';
import { Share } from './entities/share.entity';
import { Notification } from './entities/notification.entity';
import { Block } from './entities/block.entity';
import { Mute } from './entities/mute.entity';
import { Report } from './entities/report.entity';
import { AuditLog } from './entities/audit-log.entity';

loadEnv({ path: '.env.local' });
loadEnv();

export const entities = [
  User,
  Component,
  ComponentVersion,
  Tag,
  ComponentTag,
  Like,
  Favorite,
  Comment,
  Follow,
  Collection,
  CollectionComponent,
  Share,
  Notification,
  Block,
  Mute,
  Report,
  AuditLog,
];

export const typeOrmConfigFactory = (config: ConfigService): TypeOrmModuleOptions => {
  return {
    type: 'postgres',
    url: config.get<string>('database.url'),
    ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
    logging: config.get<boolean>('database.logging'),
    synchronize: config.get<boolean>('database.synchronize'),
    entities,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    migrationsRun: false,
  };
};

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_SSL ?? 'true') === 'true' ? { rejectUnauthorized: false } : false,
  logging: (process.env.DATABASE_LOGGING ?? 'false') === 'true',
  synchronize: false,
  entities,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
};

export default new DataSource(dataSourceOptions);
