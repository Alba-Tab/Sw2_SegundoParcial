import './infraestructura/observabilidad/trazas';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { entorno } from './infraestructura/configuracion/entorno';

async function main() {
  const env = entorno();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: env.CORS_ORIGENES ? env.CORS_ORIGENES.split(',').map((o) => o.trim()) : false,
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Correlation-Id', 'traceparent'],
    exposedHeaders: ['Location', 'Retry-After', 'X-Correlation-Id'],
  });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
void main();
