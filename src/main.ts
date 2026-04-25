import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import {
  ClassSerializerInterceptor,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Replace the default Nest logger with Pino so bootstrap + request
  // logs share structure and request-id correlation.
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService);

  // Forwards SIGTERM/SIGINT to @nestjs OnApplicationShutdown hooks
  // (RedisModule.quit, BullMQ workers, TypeORM pool) so a deploy rolling
  // containers doesn't abort in-flight jobs.
  app.enableShutdownHooks();

  const apiPrefix = config.get<string>('app.apiPrefix', 'api/v1');
  // Well-known canonical paths (robots.txt, RFC 9116 security.txt) must
  // resolve at the apex, not under /api/v1/ — crawlers and researchers
  // won't look anywhere else.
  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: 'robots.txt', method: RequestMethod.GET },
      { path: '.well-known/security.txt', method: RequestMethod.GET },
    ],
  });

  app.use(helmet());
  app.use(compression());
  // Explicit body-size cap. 256 KB covers the largest legitimate payload
  // (a component create with ~50-200 KB of source code) with headroom,
  // and rejects anything larger as a clear DoS guard. Image uploads go
  // direct-to-Supabase via signed URLs, never through this server.
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ limit: '32kb', extended: true }));
  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new HttpExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('Componi API')
    .setDescription('Open-source social network for reusable UI components')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, doc);

  const port = config.get<number>('app.port', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Componi API running on http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
