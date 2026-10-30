import { join } from 'node:path';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

// Los contratos del repo (en la imagen están en /app/contratos): el Outbox valida cada evento.
process.env.CONTRATOS_DIR ??= join(__dirname, '../../../../contratos');

/** Un ChoferActualizado válido según contratos/eventos. */
export const choferActualizado = (choferId: string) => ({
  choferId,
  versionAgregado: 1,
  nombre: 'Marco Quispe',
  usuarioSub: '0193a000-0000-7000-8000-000000000011',
  licenciaCategoria: 'C',
  licenciaVenceEl: '2028-01-01',
  activo: true,
});

/**
 * Mongo 8 con réplica rs0 de un nodo (las transacciones del Outbox la necesitan): se espera el log, se inicia la
 * réplica con exec y se espera a que el nodo sea primario. Por defecto la misma versión que el compose y Atlas M0;
 * la CI usa MONGO_IMAGEN_PRUEBA=mongo:7.0 porque MongoDB 8.0 no arranca en kernels 6.19+ (SERVER-121912).
 */
export async function iniciarMongoRs0(): Promise<StartedTestContainer> {
  const c = await new GenericContainer(process.env.MONGO_IMAGEN_PRUEBA ?? 'mongo:8.0.34')
    .withCommand(['--replSet', 'rs0', '--bind_ip_all'])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .withStartupTimeout(120_000)
    .start();
  const sh = (js: string) => c.exec(['mongosh', '--quiet', '--eval', js]);
  const inicio = await sh("rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]}).ok");
  if (inicio.exitCode !== 0) throw new Error(`rs.initiate falló: ${inicio.output}`);
  for (let i = 0; i < 120; i++) {
    if ((await sh('db.hello().isWritablePrimary')).output.trim() === 'true') return c;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('la réplica rs0 no llegó a primaria en 60 s');
}
