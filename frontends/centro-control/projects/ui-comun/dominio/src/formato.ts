const diaLaPaz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoy, más `dias`, como "YYYY-MM-DD" en America/La_Paz (000 §2): las fechas por defecto nunca salen de UTC. */
export function fechaLaPaz(dias = 0, ahora: Date = new Date()): string {
  const parte = (tipo: string) => Number(diaLaPaz.formatToParts(ahora).find((p) => p.type === tipo)?.value);
  return new Date(Date.UTC(parte('year'), parte('month') - 1, parte('day') + dias)).toISOString().slice(0, 10);
}

/** El único texto para un valor que falta, en fichas, celdas y cifras (DESIGN.md, "Valor vacío"). */
export const SIN_DATO = 'Sin dato';

const formatos = new Map<string, Intl.NumberFormat>();

/**
 * 1300.5 → "1.300,5": miles con punto y decimales con coma, como en Bolivia (NG-1). Nunca el pipe `number` de Angular
 * sin locale, que escribe "1,300" (se lee 1,3). `maximo` y `minimo` son los decimales.
 */
export function numero(valor: number | string | null | undefined, maximo = 2, minimo = 0): string {
  if (valor === null || valor === undefined || String(valor).trim() === '') return SIN_DATO;
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  const clave = `${minimo}-${maximo}`;
  let formato = formatos.get(clave);
  if (!formato) {
    formato = new Intl.NumberFormat('es-BO', { minimumFractionDigits: minimo, maximumFractionDigits: maximo });
    formatos.set(clave, formato);
  }
  // Un negativo que se redondea a cero se escribe «0», no «-0» (R1F-5; `signDisplay: 'negative'` no está en los tipos de TS).
  return formato.format(n).replace(/^-(?=0(,0+)?$)/, '');
}

/** 0.857 → "86 %". */
export const pct = (p: number | null | undefined) => (p === null || p === undefined ? SIN_DATO : `${Math.round(p * 100)} %`);

/** Días antes del vencimiento desde los que un documento o una licencia se marca "Por vencer". */
export const DIAS_AVISO_VENCIMIENTO = 30;

/** "YYYY-MM-DD" frente a hoy en La Paz: VENCIDO si ya pasó, POR_VENCER dentro del aviso, si no VIGENTE (grupo Vigencia). */
export function vigencia(venceEl: string, hoy: string = fechaLaPaz(), dias = DIAS_AVISO_VENCIMIENTO): 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' {
  if (venceEl < hoy) return 'VENCIDO';
  // "YYYY-MM-DD" se lee en UTC: sumar días enteros no cruza husos.
  const limite = new Date(Date.parse(hoy) + dias * 86_400_000).toISOString().slice(0, 10);
  return venceEl <= limite ? 'POR_VENCER' : 'VIGENTE';
}

/**
 * Minutos sin datos nuevos desde los que «Datos al …» pasa a tono aviso (FB-7). `datosAl` es el último evento que
 * procesó Analítica; con viajes en ruta llegan posiciones e hitos cada pocos minutos, así que media hora sin nada nuevo
 * ya dice que las cifras pueden no estar al día (también cuando no hay operación: no afirma una falla).
 */
export const MINUTOS_DATOS_VIEJOS = 30;

/** ¿El instante `al` tiene más de `minutos` frente a `ahora`? Sin instante, no hay nada que marcar. */
export function datosViejos(al: string | null | undefined, ahora: Date = new Date(), minutos = MINUTOS_DATOS_VIEJOS): boolean {
  const t = al ? Date.parse(al) : NaN;
  return Number.isFinite(t) && ahora.getTime() - t > minutos * 60_000;
}
