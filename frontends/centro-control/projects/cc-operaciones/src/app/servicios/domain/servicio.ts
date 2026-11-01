import { ETIQUETAS, SIN_DATO } from 'ui-comun/dominio';
import type { EstadoServicio, ServiciosQuery } from '../../graphql/generado';

export type Servicio = NonNullable<ServiciosQuery['servicios']>[number];
/** La razón social que trae el servicio (E5-1); si Viajes no la dio, "Sin dato", nunca el UUID. */
export const nombreCliente = (s: { razonSocial?: string | null }): string => s.razonSocial ?? SIN_DATO;

/** Spec 004: se cancela un servicio confirmado y con la confirmación completa (la saga terminó). */
export const puedeCancelarServicio = (s: Pick<Servicio, 'estado' | 'confirmacionCompleta'>): boolean =>
  s.estado === 'CONFIRMADO' && s.confirmacionCompleta;

/** El estado del filtro de la URL, si es uno del enum; un valor inventado no llega a Viajes (sería un error de validación). */
export const estadoServicio = (valor: string | null | undefined): EstadoServicio | null =>
  valor && Object.hasOwn(ETIQUETAS.EstadoServicio, valor) ? (valor as EstadoServicio) : null;
