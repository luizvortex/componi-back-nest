/**
 * Generates the OpenAPI 3.x spec into docs/frontend-integration/openapi.json.
 *
 * The frontend repo consumes this file via `openapi-typescript` to derive
 * fully-typed paths/payloads — no manual DTO duplication. Run this script
 * after any change to a controller, DTO, or @Api* decorator.
 *
 * Boot strategy:
 * - We need NestFactory.create() so the controllers are discovered and
 *   their decorator metadata is reachable. That, in turn, runs every
 *   module's onModuleInit, which would normally try to connect to the DB
 *   and Redis. To run offline (e.g. in CI without those services), this
 *   script falls back to dummy URLs the connectors will fail-soft on,
 *   then closes the app immediately after the spec is written.
 * - Errors during connection attempts are swallowed: by the time we hit
 *   them the document is already serialised.
 *
 * Usage:
 *   npm run openapi:generate
 */

import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

process.env.OPENAPI_GENERATING = 'true';

// Stub out the DataSource connection so module init doesn't try to
// dial a real Postgres. Swagger only reads decorator metadata —
// repository instances created via the patched data source never
// execute a query during spec generation. The patch must happen
// BEFORE typeorm is imported by AppModule.
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DataSource } = require('typeorm');
  const originalInitialize = DataSource.prototype.initialize;
  DataSource.prototype.initialize = async function (this: unknown) {
    // Mark as initialized internally so getRepository() etc. don't
    // throw "DataSource is not set", but skip the actual connection.
    (this as { isInitialized: boolean }).isInitialized = true;
    return this;
  };
  // Reference the original to silence "unused" lints; harmless to keep.
  void originalInitialize;
}

// Provide harmless defaults for vars the env validator requires. A real
// dev environment will already have these set; this only kicks in when
// the script runs in a fresh shell or in CI.
process.env.NODE_ENV ??= 'development';
process.env.DATABASE_URL ??= 'postgres://openapi:openapi@127.0.0.1:5432/openapi';
process.env.SUPABASE_URL ??= 'http://localhost';
process.env.SUPABASE_ANON_KEY ??= 'local';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'local';
process.env.SUPABASE_JWT_SECRET ??= 'local-secret-please-change-me';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
// Disable side-effect-heavy modules during generation so we don't fight
// connection retries while the JSON is being written.
process.env.EMBEDDINGS_ENABLED ??= 'false';
process.env.QUEUE_WORKERS_ENABLED ??= 'false';
process.env.REALTIME_ENABLED ??= 'false';

async function main(): Promise<void> {
  const { AppModule } = await import('../src/app.module');

  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    abortOnError: false,
    bufferLogs: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Componi API')
    .setDescription(
      'HTTP contract for the Componi backend. ' +
        'Realtime (Socket.IO) is documented separately in docs/frontend-integration/realtime.md.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Supabase-issued JWT — see docs/frontend-integration/auth.md',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Always anchor at the project root so it doesn't matter whether the
  // script is executed from src/scripts/ via ts-node or from dist/scripts/
  // after a build. npm scripts always set cwd to the package root.
  const outPath = resolve(process.cwd(), 'docs/frontend-integration/openapi.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n', 'utf8');

  // eslint-disable-next-line no-console
  console.log(`✓ wrote ${outPath}`);

  // close() drops DI providers; if Redis/DB never connected the close is a no-op.
  await app.close().catch(() => undefined);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('openapi generation failed:', err);
  process.exit(1);
});
