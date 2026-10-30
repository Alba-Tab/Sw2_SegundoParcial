import Chip, { type ChipProps } from '@mui/material/Chip';

export type EstadoViaje =
  | 'PROGRAMANDO'
  | 'CONFIRMADO'
  | 'EN_RUTA'
  | 'ENTREGADO'
  | 'CERRADO'
  | 'CANCELADO'
  | 'ENTREGA_OBSERVADA'
  | 'ENTREGA_RECHAZADA'
  | 'REQUIERE_INTERVENCION';

const ESTADOS: Record<EstadoViaje, { texto: string; color: ChipProps['color'] }> = {
  PROGRAMANDO: { texto: 'Confirmando', color: 'default' },
  CONFIRMADO: { texto: 'Confirmado', color: 'primary' },
  EN_RUTA: { texto: 'En ruta', color: 'info' },
  ENTREGADO: { texto: 'Entregado', color: 'success' },
  CERRADO: { texto: 'Cerrado', color: 'success' },
  CANCELADO: { texto: 'Cancelado', color: 'default' },
  ENTREGA_OBSERVADA: { texto: 'Entrega en revisión', color: 'warning' },
  ENTREGA_RECHAZADA: { texto: 'Entrega rechazada', color: 'error' },
  REQUIERE_INTERVENCION: { texto: 'En revisión por la empresa', color: 'warning' },
};

/** El estado del servicio con su color; "En aprobación" cuando la saga espera la decisión de crédito (spec 003, 2b). */
export function EstadoServicio({ estado, etapa }: { estado: EstadoViaje; etapa?: string | null }) {
  if (estado === 'PROGRAMANDO' && etapa === 'ESPERANDO_APROBACION') {
    return <Chip label="En aprobación" color="warning" size="small" variant="outlined" />;
  }
  const { texto, color } = ESTADOS[estado];
  return <Chip label={texto} color={color} size="small" variant={estado === 'CANCELADO' ? 'outlined' : 'filled'} />;
}
