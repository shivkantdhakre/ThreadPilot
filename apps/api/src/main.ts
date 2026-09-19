import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { logger } from '@threadpilot/observability';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security
  app.use(helmet());
  app.use(cookieParser());

  // Prefix all routes
  app.setGlobalPrefix('api/v1');

  // Validation pipe — strips unknown fields, validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — tighten in production
  app.enableCors({
    origin: process.env['APP_PUBLIC_URL'] ?? 'http://localhost:3000',
    credentials: true,
  });

  // Swagger (dev only)
  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ThreadPilot API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env['API_PORT'] ?? '3001', 10);
  await app.listen(port);

  logger.info({ port }, `ThreadPilot API listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, 'Failed to start API');
  process.exit(1);
});
