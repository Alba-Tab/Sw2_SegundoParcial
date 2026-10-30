import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Logger } from 'nestjs-pino';
import { ComunModule } from './infraestructura/comun.module';
import { entorno } from './infraestructura/configuracion/entorno';
import { cargarSemilla, reiniciarDemo } from './infraestructura/persistencia/semilla-mongo';

/**
 * Comando de consola (D102), nunca un endpoint: `node dist/semilla.js` carga la semilla de Flota y termina;
 * `node dist/semilla.js --reiniciar` (`demo:reiniciar`, T8.8) antes vacía las colecciones.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(ComunModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const reiniciar = process.argv.includes('--reiniciar');
  const cargar = reiniciar ? reiniciarDemo : cargarSemilla;
  const n = await cargar(app.get<Connection>(getConnectionToken()), entorno().SEMILLA_DIR);
  app.get(Logger).log(`Semilla de Flota${reiniciar ? ' (colecciones vaciadas)' : ''}: ${n.unidades} unidades y ${n.choferes} choferes`);
  await app.close();
}
void main();
