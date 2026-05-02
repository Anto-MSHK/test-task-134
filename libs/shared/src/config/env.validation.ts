import { plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  PRODUCER_PORT: number = 3000;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  CONSUMER_PORT: number = 3001;

  @IsOptional()
  @IsString()
  RABBITMQ_URL: string = 'amqp://guest:guest@localhost:5672';

  @IsOptional()
  @IsString()
  RABBITMQ_EXCHANGE: string = 'events.exchange';

  @IsOptional()
  @IsString()
  RABBITMQ_ROUTING_KEY: string = 'events.notification';

  @IsOptional()
  @IsString()
  RABBITMQ_QUEUE: string = 'events.notification.queue';

  @IsOptional()
  @IsString()
  RABBITMQ_RETRY_QUEUE: string = 'events.notification.retry.queue';

  @IsOptional()
  @IsString()
  RABBITMQ_DLQ: string = 'events.notification.dlq';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  RABBITMQ_PREFETCH: number = 5;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  MAX_RETRY_ATTEMPTS: number = 3;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  RETRY_DELAY_MS: number = 5000;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_DEFAULT_CHAT_ID?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
