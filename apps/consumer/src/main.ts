import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

import { ConsumerAppModule } from './consumer-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ConsumerAppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('CONSUMER_PORT', 3001);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port);
}

void bootstrap();
