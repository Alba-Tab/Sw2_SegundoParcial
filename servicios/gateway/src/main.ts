import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configuracion } from './configuracion';

async function main() {
  const config = configuracion();
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  if (config.corsOrigenes.length) {
    app.enableCors({
      origin: config.corsOrigenes,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Correlation-Id', 'traceparent'],
      maxAge: 600,
    });
  }
  app.enableShutdownHooks();
  await app.listen(config.puerto, '0.0.0.0');
}
void main();
