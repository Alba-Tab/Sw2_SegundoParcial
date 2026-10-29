/** Chofer (spec 010, sección D): llega de la semilla; `disponible` es false mientras tiene una reserva activa (D11). */
export interface Chofer {
  choferId: string;
  nombre: string;
  usuarioSub: string;
  licenciaCategoria: 'A' | 'B' | 'C';
  /** Fecha `YYYY-MM-DD`. */
  licenciaVenceEl: string;
  activo: boolean;
  disponible: boolean;
}

/** Spec 003: activo, libre y con licencia categoría C vigente el día del viaje. */
export function choferHabilitado(c: Chofer, fecha: string): boolean {
  return c.activo && c.disponible && c.licenciaCategoria === 'C' && c.licenciaVenceEl >= fecha;
}

/** Orden estable entre los habilitados: por choferId (la semilla deja primero a chofer1). */
export function porChoferId(a: Chofer, b: Chofer): number {
  return a.choferId.localeCompare(b.choferId);
}
