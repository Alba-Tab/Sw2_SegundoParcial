const diaLaPaz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoy, más `dias`, como "YYYY-MM-DD" en America/La_Paz (000 §2): las fechas por defecto nunca salen de UTC. */
export function fechaLaPaz(dias = 0, ahora: Date = new Date()): string {
  const parte = (tipo: string) => Number(diaLaPaz.formatToParts(ahora).find((p) => p.type === tipo)?.value);
  return new Date(Date.UTC(parte('year'), parte('month') - 1, parte('day') + dias)).toISOString().slice(0, 10);
}

/** 0.857 → "86 %". */
export const pct = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);

/** Días antes del vencimiento desde los que un documento o una licencia se marca "Por vencer". */
export const DIAS_AVISO_VENCIMIENTO = 30;

/** "YYYY-MM-DD" frente a hoy en La Paz: VENCIDO si ya pasó, POR_VENCER dentro del aviso, si no VIGENTE (grupo Vigencia). */
export function vigencia(venceEl: string, hoy: string = fechaLaPaz(), dias = DIAS_AVISO_VENCIMIENTO): 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' {
  if (venceEl < hoy) return 'VENCIDO';
  // "YYYY-MM-DD" se lee en UTC: sumar días enteros no cruza husos.
  const limite = new Date(Date.parse(hoy) + dias * 86_400_000).toISOString().slice(0, 10);
  return venceEl <= limite ? 'POR_VENCER' : 'VIGENTE';
}
