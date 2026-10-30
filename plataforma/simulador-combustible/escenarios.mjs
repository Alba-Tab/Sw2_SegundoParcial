// Escenarios del sensor de combustible (spec 009, D08). Funciones puras: el simulador y las pruebas las comparten.

export const INTERVALO_S = 10;
export const ESCENARIOS = ['normal', 'robo'];

const VELOCIDAD_KMH = 65;
const EN_MARCHA = 30; // lecturas en marcha por ciclo (5 min)
const DETENIDO = 6; // lecturas detenido por ciclo (1 min)
const BAJA_EN_MARCHA = 0.05;
const BAJA_ROBO = 2;
const LECTURAS_ROBO = 6; // 60 s, 12 puntos; Flota lo detecta a los 40 s

/** Lectura número `paso` (desde 0) de un escenario, a partir del nivel anterior. */
export function siguiente(escenario, paso, nivelPct) {
  if (escenario === 'robo') {
    // Una lectura en marcha cierra la parada anterior, la siguiente es la referencia y luego baja 2 puntos por lectura.
    if (paso === 0) return { nivelPct, velocidadKmh: VELOCIDAD_KMH };
    if (paso === 1) return { nivelPct, velocidadKmh: 0 };
    if (paso <= 1 + LECTURAS_ROBO) return { nivelPct: redondear(nivelPct - BAJA_ROBO), velocidadKmh: 0 };
    return siguiente('normal', paso - 2 - LECTURAS_ROBO, nivelPct);
  }
  if (paso % (EN_MARCHA + DETENIDO) < EN_MARCHA) {
    return { nivelPct: redondear(nivelPct - BAJA_EN_MARCHA), velocidadKmh: VELOCIDAD_KMH };
  }
  return { nivelPct, velocidadKmh: 0 };
}

export function lectura(placa, capacidadLitros, { nivelPct, velocidadKmh }, medidoEn) {
  return { placa, nivelPct, capacidadLitros, velocidadKmh, medidoEn: medidoEn.toISOString() };
}

export const tema = (placa) => `camion/${placa}/combustible`;

const redondear = (n) => Math.max(0, Math.round(n * 100) / 100);
