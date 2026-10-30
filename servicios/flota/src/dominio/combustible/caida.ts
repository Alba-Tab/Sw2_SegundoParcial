/** Lectura del sensor (contratos/eventos/flota/LecturaSensorCombustible.v1). */
export interface Lectura {
  placa: string;
  nivelPct: number;
  velocidadKmh: number;
  medidoEn: string;
  capacidadLitros?: number;
}

export const CAIDA_MINIMA_PCT = 8;
export const VENTANA_MINUTOS = 10;

export interface Caida {
  nivelAnteriorPct: number;
  nivelActualPct: number;
  caidaPct: number;
  ventanaMinutos: number;
}

/**
 * Regla de caída (spec 009, D08). Con el camión detenido, la referencia es el mayor nivel de las lecturas de los últimos
 * 10 min con velocidad 0 y posteriores a la última lectura en marcha; si la referencia menos el nivel actual es 8 puntos
 * o más, hay caída. `anteriores` son las lecturas previas de la placa, en cualquier orden. Una subida no dispara nada.
 */
export function detectarCaida(anteriores: Lectura[], actual: Lectura): Caida | null {
  if (actual.velocidadKmh > 0) return null;
  const t = Date.parse(actual.medidoEn);
  const previas = anteriores.filter((l) => Date.parse(l.medidoEn) < t);
  const ultimaEnMarcha = Math.max(...previas.filter((l) => l.velocidadKmh > 0).map((l) => Date.parse(l.medidoEn)), -Infinity);
  const parada = previas.filter(
    (l) => l.velocidadKmh === 0 && Date.parse(l.medidoEn) > ultimaEnMarcha && t - Date.parse(l.medidoEn) <= VENTANA_MINUTOS * 60_000,
  );
  if (!parada.length) return null;
  const referencia = parada.reduce((a, b) => (b.nivelPct > a.nivelPct ? b : a));
  const caida = Math.round((referencia.nivelPct - actual.nivelPct) * 100) / 100;
  if (caida < CAIDA_MINIMA_PCT) return null;
  return {
    nivelAnteriorPct: referencia.nivelPct,
    nivelActualPct: actual.nivelPct,
    caidaPct: caida,
    ventanaMinutos: Math.max(Math.round(((t - Date.parse(referencia.medidoEn)) / 60_000) * 100) / 100, 0.01),
  };
}

/** Inicio del episodio de parada: la primera lectura detenida después de la última en marcha (una detección por parada). */
export function inicioDeParada(anteriores: Lectura[], actual: Lectura): string {
  const t = Date.parse(actual.medidoEn);
  const previas = anteriores.filter((l) => Date.parse(l.medidoEn) < t).sort((a, b) => Date.parse(a.medidoEn) - Date.parse(b.medidoEn));
  let inicio = actual.medidoEn;
  for (let i = previas.length - 1; i >= 0 && previas[i].velocidadKmh === 0; i--) inicio = previas[i].medidoEn;
  return inicio;
}
