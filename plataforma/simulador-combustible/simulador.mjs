// Simulador del sensor de combustible (T5.4, spec 009). Publica una LecturaSensorCombustible cada 10 s por placa en
// camion/{placa}/combustible. Local: mqtt://localhost:1883. Nube (F3b): mqtts://…:8883 con MQTT_CA (la CA propia).
// Si el broker cae, reintenta cada 5 s (D74) y las lecturas de ese lapso se pierden.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import mqtt from 'mqtt';
import { ESCENARIOS, INTERVALO_S, lectura, siguiente, tema } from './escenarios.mjs';

const { values: op } = parseArgs({
  options: {
    placa: { type: 'string', default: '4521KTR' },
    escenario: { type: 'string', default: 'normal' },
    nivel: { type: 'string', default: '62' },
    capacidad: { type: 'string', default: '600' },
    intervalo: { type: 'string', default: String(INTERVALO_S) },
    lecturas: { type: 'string' },
  },
});
if (!ESCENARIOS.includes(op.escenario)) salir(`--escenario debe ser ${ESCENARIOS.join(' o ')}`);
const placas = op.placa.split(',').map((p) => p.trim());
const capacidad = Number(op.capacidad);
const intervaloMs = Number(op.intervalo) * 1000;
const total = op.lecturas === undefined ? Infinity : Number(op.lecturas);
const url = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
if (!process.env.MQTT_CLAVE) salir('Falta MQTT_CLAVE (RABBITMQ_CLAVE_SENSOR)');

const cliente = mqtt.connect(url, {
  username: process.env.MQTT_USUARIO ?? 'sensor-sim',
  password: process.env.MQTT_CLAVE,
  ca: process.env.MQTT_CA ? readFileSync(process.env.MQTT_CA) : undefined,
  clientId: `sensor-sim-${placas.join('-')}-${process.pid}`,
  reconnectPeriod: 5000,
  connectTimeout: 5000,
});
let reloj;
cliente.on('connect', () => {
  log(`conectado a ${url}`);
  // El reloj arranca con la primera conexión; después, si el broker cae, las lecturas de ese lapso se pierden.
  if (reloj) return;
  reloj = setInterval(publicar, intervaloMs);
  publicar();
});
cliente.on('reconnect', () => log('reintentando la conexión en 5 s'));
cliente.on('error', (e) => log(`error: ${e.code ?? e.message}`));

const niveles = Object.fromEntries(placas.map((p) => [p, Number(op.nivel)]));
let paso = 0;
log(`escenario ${op.escenario} para ${placas.join(', ')}, cada ${op.intervalo} s`);

async function publicar() {
  if (paso >= total) return terminar();
  const ahora = new Date();
  const n = paso++;
  for (const placa of placas) {
    const estado = siguiente(op.escenario, n, niveles[placa]);
    niveles[placa] = estado.nivelPct;
    if (!cliente.connected) {
      log(`${placa}: sin broker, se pierde la lectura ${n}`);
      continue;
    }
    await cliente.publishAsync(tema(placa), JSON.stringify(lectura(placa, capacidad, estado, ahora)), { qos: 1 });
    log(`${placa}: ${estado.nivelPct} % a ${estado.velocidadKmh} km/h`);
  }
  if (paso >= total) terminar();
}

function terminar() {
  clearInterval(reloj);
  cliente.end(false, () => process.exit(0));
}

function log(m) {
  console.log(`${new Date().toISOString()} ${m}`);
}

function salir(m) {
  console.error(m);
  process.exit(2);
}

process.on('SIGINT', terminar);
process.on('SIGTERM', terminar);
