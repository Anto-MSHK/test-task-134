import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ProducerAppModule } from './producer-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ProducerAppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PRODUCER_PORT', 3000);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Event Notification Producer API')
    .setDescription('HTTP API for publishing domain events to RabbitMQ.')
    .setVersion('1.0')
    .addTag('events')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(port);
}

void bootstrap();
