const ZONA = 'America/La_Paz';

/** Dinero (000: siempre texto con 2 decimales); solo se convierte a número para mostrarlo. */
export function dinero(m: { monto: string; moneda: string }): string {
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency: m.moneda, currencyDisplay: 'code' }).format(Number(m.monto));
}

export function fecha(f: string): string {
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${f}T00:00:00Z`));
}

export function instante(i: string): string {
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA }).format(new Date(i));
}

/** Hoy en La Paz más `dias`, como YYYY-MM-DD. */
export function diaDesdeHoy(dias = 0, ahora = new Date()): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const TIPOS_CARGA = {
  GRANOS: 'Granos',
  INSUMOS: 'Insumos',
  INSUMOS_LIQUIDOS: 'Insumos líquidos',
  CONTENEDOR: 'Contenedor',
} as const;
