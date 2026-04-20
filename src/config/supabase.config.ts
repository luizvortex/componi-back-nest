import { registerAs } from '@nestjs/config';

export type SupabaseJwtStrategy = 'hs256' | 'jwks';

export default registerAs('supabase', () => ({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'component-thumbnails',
  jwt: {
    strategy: (process.env.SUPABASE_JWT_STRATEGY ?? 'hs256') as SupabaseJwtStrategy,
    secret: process.env.SUPABASE_JWT_SECRET,
    jwksUri: process.env.SUPABASE_JWKS_URI,
    audience: process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated',
    issuer: process.env.SUPABASE_JWT_ISSUER,
  },
}));
