import type { ServiciosQuery } from '../../graphql/generado';

export type Servicio = NonNullable<ServiciosQuery['servicios']>[number];
/** La copia de clientes puede llegar parcial (respuesta parcial de Apollo con errorPolicy 'all'). */
type Cliente = { clienteId?: string; razonSocial?: string } | null | undefined;

/** Spec 004: el motivo de la cancelación es obligatorio, de 3 a 300 caracteres. */
export const motivoCancelacionValido = (motivo: string | undefined): boolean => {
  const n = (motivo ?? '').trim().length;
  return n >= 3 && n <= 300;
};

/** La razón social de la copia de clientes; si no está, el id. */
export const nombreCliente = (clientes: readonly Cliente[] | null | undefined, id: string): string =>
  clientes?.find((c) => c?.clienteId === id)?.razonSocial ?? id;
