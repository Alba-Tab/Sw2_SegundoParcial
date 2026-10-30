import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ActualizarChofer, type CambioChofer } from './aplicacion/chofer/actualizar-chofer';
import { CHOFER_REPOSITORIO } from './aplicacion/puertos/chofer-repositorio';
import { REGISTRO_DE_EVENTOS } from './aplicacion/puertos/registro-de-eventos';
import { UNIDAD_DE_TRABAJO } from './aplicacion/puertos/unidad-de-trabajo';
import { ComunModule } from './infraestructura/comun.module';

/**
 * CLI de Flota (spec 010, sección D; nunca un endpoint). Uso:
 *   node dist/cli.js choferes:actualizar <choferId> [--licenciaVenceEl=AAAA-MM-DD] [--licenciaCategoria=C] [--activo=false]
 * El relay del worker publica el ChoferActualizado que queda en el Outbox.
 */
async function main([comando, choferId, ...opciones]: string[]) {
  if (comando !== 'choferes:actualizar' || !choferId) {
    console.error('Uso: node dist/cli.js choferes:actualizar <choferId> [--licenciaVenceEl=…] [--licenciaCategoria=…] [--activo=…]');
    process.exit(2);
  }
  const cambio: CambioChofer = {};
  for (const o of opciones) {
    const [clave, valor] = o.replace(/^--/, '').split('=');
    if (clave === 'activo') cambio.activo = valor === 'true';
    else if (clave === 'licenciaVenceEl' || clave === 'nombre') cambio[clave] = valor;
    else if (clave === 'licenciaCategoria') cambio.licenciaCategoria = valor as CambioChofer['licenciaCategoria'];
  }
  const app = await NestFactory.createApplicationContext(ComunModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const caso = new ActualizarChofer(app.get(UNIDAD_DE_TRABAJO), app.get(CHOFER_REPOSITORIO), app.get(REGISTRO_DE_EVENTOS));
  const version = await caso.ejecutar(choferId, cambio);
  app.get(Logger).log(`Chofer ${choferId} actualizado a la versión ${version}`);
  await app.close();
}
void main(process.argv.slice(2));
