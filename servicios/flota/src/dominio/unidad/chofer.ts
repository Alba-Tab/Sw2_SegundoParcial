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

const conflicto = (c: Chofer, mensaje: string): never => {
  throw new ErrorDeDominio('CONFLICTO_ESTADO', mensaje, { choferId: c.choferId, activo: c.activo, disponible: c.disponible });
};

/**
 * D104: habilitar o inhabilitar desde el Centro de Control. Inhabilitar pide motivo y no se puede con una reserva activa
 * (`disponible = false`): el viaje ya tiene a ese chofer. Pedir el estado que ya tiene es CONFLICTO_ESTADO (sin versión
 * nueva ni evento). Habilitar borra el motivo de la inhabilitación.
 */
export function cambiarHabilitacion(c: Chofer, activo: boolean, motivo: string | undefined, ahora: Date): Chofer {
  if (c.activo === activo) conflicto(c, `El chofer ya está ${activo ? 'habilitado' : 'inhabilitado'}`);
  const { inhabilitacion: _previa, ...resto } = c;
  if (activo) return { ...resto, activo: true };
  if (!motivo?.trim()) throw new ErrorDeDominio('VALIDACION', 'motivo: es obligatorio al inhabilitar', { campo: 'motivo' });
  if (!c.disponible) conflicto(c, 'El chofer tiene una reserva activa y no se puede inhabilitar');
  return { ...resto, activo: false, inhabilitacion: { motivo: motivo.trim(), desde: ahora.toISOString() } };
}

/**
 * D104: nombre y licencia. Con una reserva activa (`disponible = false`) la licencia tiene que seguir siendo C y vigente
 * hoy, la que pidió la reserva (spec 003): si no, CONFLICTO_ESTADO.
 */
export function editarChofer(c: Chofer, e: Pick<Chofer, 'nombre' | 'licenciaCategoria' | 'licenciaVenceEl'>, hoy: string): Chofer {
  if (!c.disponible && (e.licenciaCategoria !== 'C' || e.licenciaVenceEl < hoy)) {
    conflicto(c, 'El chofer tiene una reserva activa: su licencia debe seguir siendo C y vigente');
  }
  return { ...c, nombre: e.nombre.trim(), licenciaCategoria: e.licenciaCategoria, licenciaVenceEl: e.licenciaVenceEl };
}

/** CLI `choferes:actualizar`: aplica el cambio; habilitar (`activo = true`) borra el motivo de la inhabilitación. */
export function aplicarCambio<C extends Chofer>(
  c: C,
  cambio: Partial<Pick<Chofer, 'nombre' | 'licenciaCategoria' | 'licenciaVenceEl' | 'activo'>>,
): C {
  const { inhabilitacion: _previa, ...resto } = c;
  return cambio.activo ? ({ ...resto, ...cambio } as C) : { ...c, ...cambio };
}
