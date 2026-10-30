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
