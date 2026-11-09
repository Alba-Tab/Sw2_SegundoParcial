import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { crearModulo } from './app.module';
import { configuracion } from './configuracion';
import { LoggerJson } from './log';

async function main() {
  const app = await NestFactory.create(crearModulo(), { logger: new LoggerJson() });
  app.enableShutdownHooks();
  await app.listen(configuracion().puerto, '0.0.0.0');
}
void main();
