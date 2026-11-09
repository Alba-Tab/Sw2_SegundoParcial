import { type ErroresCampo, mensajeCampo } from 'ui-comun/dominio';
import type { ClienteFichaFragment, ClienteQuery, ClientesQuery } from '../../graphql/generado';

/** Clientes (G7): lista, ficha por id (B1) y edición de razón social, NIT y correo (comercial y gerente). */
export type FilaCliente = NonNullable<ClientesQuery['clientes']>['items'][number];
export type DatosCliente = ClienteFichaFragment;
export type ServicioCliente = NonNullable<ClienteQuery['servicios']>[number];

/** Quién edita un cliente (Viajes y el Gateway vuelven a validar). */
export const ROLES_EDICION_CLIENTE = ['comercial', 'gerente'];

/** Las reglas del alta (spec 001, DatosCliente en Viajes): NIT de 5 a 20 dígitos y correo con dominio. */
export const NIT = /^[0-9]{5,20}$/;
export const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Lo que encuentra la búsqueda: razón social, NIT y correo. */
export const textoCliente = (c: Pick<FilaCliente, 'razonSocial' | 'nit' | 'correo'>): string =>
  [c.razonSocial, c.nit ?? '', c.correo ?? ''].join(' ');

/** El nombre de la ruta de la copia de rutas; si no está, nada (la fila muestra solo la carga). */
export const nombreRuta = (
  rutas: readonly { rutaId: string; nombre: string }[] | null | undefined,
  id: string | null | undefined,
): string => (id && rutas?.find((r) => r.rutaId === id)?.nombre) || '';

/** El error de un campo de la edición: NIT y correo dicen qué forma esperan; lo demás, como en todo formulario. */
export function mensajeCampoCliente(campo: 'razonSocial' | 'nit' | 'correo', errores: ErroresCampo): string {
  if (errores?.['nitRepetido']) return 'Ya hay otro cliente activo con ese NIT.';
  if (errores?.['pattern'] && campo === 'nit') return 'El NIT tiene de 5 a 20 dígitos, sin letras, puntos ni guiones.';
  if (errores?.['pattern']) return 'Escribe un correo válido, por ejemplo cobranzas@empresa.com.';
  return mensajeCampo(errores);
}
