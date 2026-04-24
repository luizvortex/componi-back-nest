import appConfig from './app.config';
import complianceConfig from './compliance.config';
import databaseConfig from './database.config';
import embeddingsConfig from './embeddings.config';
import redisConfig from './redis.config';
import supabaseConfig from './supabase.config';

export const configurations = [
  appConfig,
  complianceConfig,
  databaseConfig,
  embeddingsConfig,
  redisConfig,
  supabaseConfig,
];
