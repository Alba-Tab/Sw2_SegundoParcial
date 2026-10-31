const diaLaPaz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoy, más `dias`, como "YYYY-MM-DD" en America/La_Paz (000 §2): las fechas por defecto nunca salen de UTC. */
export function fechaLaPaz(dias = 0, ahora: Date = new Date()): string {
  const parte = (tipo: string) => Number(diaLaPaz.formatToParts(ahora).find((p) => p.type === tipo)?.value);
  return new Date(Date.UTC(parte('year'), parte('month') - 1, parte('day') + dias)).toISOString().slice(0, 10);
}

/** 0.857 → "86 %". */
export const pct = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)} %`);
