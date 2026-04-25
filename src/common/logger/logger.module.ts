import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Structured logging + per-request correlation IDs. Pretty-printed in
 * development, JSON in production so log aggregators (Loki, Datadog,
 * CloudWatch) can index fields like req.id, responseTime, statusCode.
 *
 * We pick the request ID off the `x-request-id` header if the caller
 * provides one (useful for tracing through a CDN / gateway) and mint a
 * UUID otherwise. The ID is echoed back on the response so the client
 * can reference it in support tickets.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('app.nodeEnv', 'development') === 'production';
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            genReqId: (req: IncomingMessage) => {
              const incoming = req.headers['x-request-id'];
              if (typeof incoming === 'string' && incoming.length <= 128) return incoming;
              return randomUUID();
            },
            customProps: () => ({ service: 'componi-api' }),
            // Strip sensitive headers from the access log.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-supabase-auth"]',
                'res.headers["set-cookie"]',
              ],
              remove: true,
            },
            transport: isProd
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname,service,req.headers,res.headers',
                  },
                },
            // Standard serializers — add the request id into the access
            // log line automatically.
            customLogLevel: (_req, res, err) => {
              if (err || (res.statusCode ?? 0) >= 500) return 'error';
              if ((res.statusCode ?? 0) >= 400) return 'warn';
              return 'info';
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
