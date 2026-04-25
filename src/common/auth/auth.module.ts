import { Global, Module } from '@nestjs/common';

import { SupabaseJwtVerifier } from './supabase-jwt-verifier';

/**
 * Hosts shared auth primitives — currently the JWT verifier reused by
 * the HTTP guard and the WebSocket gateway. Global so neither side
 * needs to import this module explicitly.
 */
@Global()
@Module({
  providers: [SupabaseJwtVerifier],
  exports: [SupabaseJwtVerifier],
})
export class AuthCommonModule {}
