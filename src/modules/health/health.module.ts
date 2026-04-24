import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';

/**
 * Public `/health` for liveness + readiness probes. Load balancers and
 * orchestrators (k8s, Render, Fly) hit this — it must stay cheap and
 * must not require auth. DB + Redis are the two hard dependencies.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
