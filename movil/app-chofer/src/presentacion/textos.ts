import type { EstadoViaje } from '../dominio/viaje';

export const ESTADOS: Record<EstadoViaje, string> = {
  PROGRAMANDO: 'Confirmando',
  CONFIRMADO: 'Confirmado',
  EN_RUTA: 'En ruta',
  ENTREGADO: 'Entregado',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
  ENTREGA_OBSERVADA: 'Entrega en revisión',
  ENTREGA_RECHAZADA: 'Entrega rechazada',
  REQUIERE_INTERVENCION: 'En revisión',
};

export const CARGAS: Record<string, string> = {
  GRANOS: 'Granos',
  INSUMOS: 'Insumos',
  INSUMOS_LIQUIDOS: 'Insumos líquidos',
  CONTENEDOR: 'Contenedor',
};

export const OPERACIONES: Record<string, string> = {
  INICIO: 'Inicio del viaje',
  HITO: 'Hito de la bitácora',
  EVENTO_CONDUCCION: 'Evento de conducción',
  CARGA_COMBUSTIBLE: 'Carga de combustible',
  ENTREGA: 'Entrega',
  RECHAZO: 'Rechazo en destino',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** `2026-12-19` → `19 dic 2026` (la fecha del viaje es un día, sin hora ni zona: no pasa por Date). */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return MESES[Number(mes) - 1] ? `${Number(dia)} ${MESES[Number(mes) - 1]} ${anio}` : iso;
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
