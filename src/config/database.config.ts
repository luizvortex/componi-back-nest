import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_SSL ?? 'true') === 'true',
  logging: (process.env.DATABASE_LOGGING ?? 'false') === 'true',
  synchronize: (process.env.DATABASE_SYNCHRONIZE ?? 'false') === 'true',
}));
