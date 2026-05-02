import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

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

  await app.listen(port);
}

void bootstrap();
