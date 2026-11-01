import { ErrorDeDominio } from '../comun/error-de-dominio';

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
  /** Por qué y desde cuándo está inhabilitado (D104); no está si se inhabilitó por la semilla o la CLI. */
  inhabilitacion?: { motivo: string; desde: string };
}

/** Spec 003: activo, libre y con licencia categoría C vigente el día del viaje. */
export function choferHabilitado(c: Chofer, fecha: string): boolean {
  return c.activo && c.disponible && c.licenciaCategoria === 'C' && c.licenciaVenceEl >= fecha;
}

/** Orden estable entre los habilitados: por choferId (la semilla deja primero a chofer1). */
export function porChoferId(a: Chofer, b: Chofer): number {
  return a.choferId.localeCompare(b.choferId);
}

/**
 * D104: habilitar o inhabilitar desde el Centro de Control. Inhabilitar pide motivo y no se puede con una reserva activa
 * (`disponible = false`): el viaje ya tiene a ese chofer.
 */
export function cambiarHabilitacion(c: Chofer, activo: boolean, motivo: string | undefined, ahora: Date): Chofer {
  const { inhabilitacion: _previa, ...resto } = c;
  if (activo) return { ...resto, activo: true };
  if (!motivo?.trim()) throw new ErrorDeDominio('VALIDACION', 'motivo: es obligatorio al inhabilitar', { campo: 'motivo' });
  if (!c.disponible) {
    throw new ErrorDeDominio('CONFLICTO_ESTADO', 'El chofer tiene una reserva activa y no se puede inhabilitar', { choferId: c.choferId });
  }
  return { ...resto, activo: false, inhabilitacion: { motivo: motivo.trim(), desde: ahora.toISOString() } };
}
