import { ETIQUETAS } from 'ui-comun/dominio';
import type { EstadoServicio, ServiciosQuery } from '../../graphql/generado';

export type Servicio = NonNullable<ServiciosQuery['servicios']>[number];
/** La copia de clientes puede llegar parcial (respuesta parcial de Apollo con errorPolicy 'all'). */
type Cliente = { clienteId?: string; razonSocial?: string } | null | undefined;

/** Lo que se muestra si el cliente no vino en la copia (más allá del tope de 100): nunca el id crudo. */
export const CLIENTE_FUERA_DE_LISTA = 'Cliente fuera de la lista cargada';

/** La razón social de la copia de clientes; si no está, un texto que lo dice (no el UUID). */
export const nombreCliente = (clientes: readonly Cliente[] | null | undefined, id: string): string =>
  clientes?.find((c) => c?.clienteId === id)?.razonSocial ?? CLIENTE_FUERA_DE_LISTA;

/** Spec 004: se cancela un servicio confirmado y con la confirmación completa (la saga terminó). */
export const puedeCancelarServicio = (s: Pick<Servicio, 'estado' | 'confirmacionCompleta'>): boolean =>
  s.estado === 'CONFIRMADO' && s.confirmacionCompleta;

/** El estado del filtro de la URL, si es uno del enum; un valor inventado no llega a Viajes (sería un error de validación). */
export const estadoServicio = (valor: string | null | undefined): EstadoServicio | null =>
  valor && Object.hasOwn(ETIQUETAS.EstadoServicio, valor) ? (valor as EstadoServicio) : null;
