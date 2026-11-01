import Block from '@mui/icons-material/Block';
import Cancel from '@mui/icons-material/Cancel';
import CheckCircle from '@mui/icons-material/CheckCircle';
import EventAvailable from '@mui/icons-material/EventAvailable';
import HourglassTop from '@mui/icons-material/HourglassTop';
import Lock from '@mui/icons-material/Lock';
import ReceiptLong from '@mui/icons-material/ReceiptLong';
import Route from '@mui/icons-material/Route';
import Warning from '@mui/icons-material/Warning';
import Chip, { type ChipProps } from '@mui/material/Chip';
import type { ReactElement } from 'react';
import type { EstadoFactura as ValorEstadoFactura } from '../../api/generado/finanzas';

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

/** Texto, icono y tono de un estado (DESIGN.md, "Estados"): el mismo icono que en el Centro de Control para el mismo significado. */
interface Etiqueta {
  texto: string;
  icono: ReactElement;
  color: ChipProps['color'];
}

const ESTADOS: Record<EstadoViaje, Etiqueta> = {
  PROGRAMANDO: { texto: 'Confirmando', icono: <HourglassTop />, color: 'primary' },
  CONFIRMADO: { texto: 'Confirmado', icono: <EventAvailable />, color: 'primary' },
  EN_RUTA: { texto: 'En ruta', icono: <Route />, color: 'primary' },
  ENTREGADO: { texto: 'Entregado', icono: <CheckCircle />, color: 'success' },
  CERRADO: { texto: 'Cerrado', icono: <Lock />, color: 'default' },
  CANCELADO: { texto: 'Cancelado', icono: <Cancel />, color: 'default' },
  ENTREGA_OBSERVADA: { texto: 'Entrega en revisión', icono: <Warning />, color: 'warning' },
  ENTREGA_RECHAZADA: { texto: 'Entrega rechazada', icono: <Block />, color: 'error' },
  // Para el cliente es «esperando a la empresa», no una falla: mismo icono y tono que «Confirmando» (A-5).
  REQUIERE_INTERVENCION: { texto: 'En revisión por la empresa', icono: <HourglassTop />, color: 'primary' },
};

const EN_APROBACION: Etiqueta = { texto: 'En aprobación', icono: <HourglassTop />, color: 'warning' };

const ESTADOS_FACTURA: Record<ValorEstadoFactura, Etiqueta> = {
  EMITIDA: { texto: 'Por pagar', icono: <ReceiptLong />, color: 'primary' },
  PAGADA_PARCIAL: { texto: 'Pago parcial', icono: <HourglassTop />, color: 'warning' },
  PAGADA: { texto: 'Pagada', icono: <CheckCircle />, color: 'success' },
};

// Los iconos de MUI ya llevan aria-hidden: el lector de pantalla lee solo el texto. Lo neutro va con borde, sin relleno.
const Estado = ({ texto, icono, color }: Etiqueta) => (
  <Chip label={texto} icon={icono} color={color} size="small" variant={color === 'default' ? 'outlined' : 'filled'} />
);

/** El estado del servicio; "En aprobación" cuando la saga espera la decisión de crédito (spec 003, 2b). */
export function EstadoServicio({ estado, etapa }: { estado: EstadoViaje; etapa?: string | null }) {
  return <Estado {...(estado === 'PROGRAMANDO' && etapa === 'ESPERANDO_APROBACION' ? EN_APROBACION : ESTADOS[estado])} />;
}

/** El estado de una factura (spec 008). */
export function EstadoFactura({ estado }: { estado: ValorEstadoFactura }) {
  return <Estado {...ESTADOS_FACTURA[estado]} />;
}
