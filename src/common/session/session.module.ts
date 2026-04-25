import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../../database/entities/user.entity';
import { SessionService } from './session.service';

/**
 * Global so SupabaseAuthGuard (wired in AppModule) can inject SessionService
 * without any module declaring it locally. Depends on CacheModule (also
 * global) for the Redis-backed store.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
