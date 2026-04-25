import { Global, Module } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * Global so notifications, social, comments, and any future emit
 * point can inject RealtimeService without forming circular imports
 * back through their own modules.
 */
@Global()
@Module({
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
