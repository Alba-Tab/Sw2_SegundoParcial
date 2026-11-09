import { z } from 'zod';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';

const TIPOS: Record<string, string> = {
  string: 'un texto',
  number: 'un número',
  int: 'un número entero',
  boolean: 'true o false',
  object: 'un objeto',
  array: 'una lista',
};
const FORMATOS: Record<string, string> = {
  date: 'Debe ser una fecha AAAA-MM-DD',
  datetime: 'Debe ser un instante ISO-8601 en UTC',
  uuid: 'Debe ser un UUID',
  email: 'Debe ser un correo válido',
};
const cuantos = (n: unknown, origen: unknown) =>
  origen === 'string'
    ? `${n} ${n === 1 ? 'carácter' : 'caracteres'}`
    : origen === 'array'
      ? `${n} ${n === 1 ? 'elemento' : 'elementos'}`
      : null;

/**
 * Mensajes de validación propios en español (000 §5), en vez de la traducción automática de zod ("Demasiado pequeño: se
 * esperaba que texto tuviera >=3 caracteres"). Lo que no está aquí sale con un texto genérico, nunca en inglés.
 */
export function mensajeZod(i: { code?: string; input?: unknown } & Record<string, unknown>): string {
  switch (i.code) {
    case 'invalid_type':
      return i.input === undefined ? 'Es obligatorio' : `Debe ser ${TIPOS[String(i['expected'])] ?? String(i['expected'])}`;
    case 'too_small': {
      const n = cuantos(i['minimum'], i['origin']);
      if (n) return `Debe tener al menos ${n}`;
      return `Debe ser ${i['inclusive'] === false ? 'mayor que' : 'mayor o igual que'} ${String(i['minimum'])}`;
    }
    case 'too_big': {
      const n = cuantos(i['maximum'], i['origin']);
      if (n) return `Debe tener como máximo ${n}`;
      return `Debe ser ${i['inclusive'] === false ? 'menor que' : 'menor o igual que'} ${String(i['maximum'])}`;
    }
    case 'invalid_value':
      return `Debe ser una de: ${((i['values'] as unknown[]) ?? []).map(String).join(', ')}`;
    case 'invalid_format':
      return FORMATOS[String(i['format'])] ?? 'No tiene el formato esperado';
    case 'unrecognized_keys':
      return `No se aceptan estos campos: ${((i['keys'] as string[]) ?? []).join(', ')}`;
    default:
      return 'No es válido';
  }
}
z.config({ customError: (i) => mensajeZod(i as unknown as Parameters<typeof mensajeZod>[0]) });

/**
 * Texto con los espacios de los bordes recortados antes de contar el largo: el esquema generado del contrato no recorta,
 * y "  ab " pasaría un mínimo de 3 para llegar como "ab" al dominio y al Outbox.
 */
export const textoRecortado = (min: number, max: number) => z.string().trim().min(min).max(max);

/**
 * Valida contra el esquema zod generado del contrato; el primer error va como `campo` (000 §5).
 *
 * Antes revisa el valor crudo: JSON.parse deja `__proto__` como campo propio, pero zod lo descarta en silencio al armar
 * su resultado (asignarlo cambia el prototipo), así que el dominio nunca lo vería. Un campo `__proto__` en cualquier
 * nivel es 400 con su ruta (D76).
 */
export function validar<S extends z.ZodTypeAny>(esquema: S, valor: unknown): z.infer<S> {
  const proto = rutaDeProto(valor);
  if (proto !== undefined) throw new ErrorDeDominio('VALIDACION', `${proto}: no se acepta como nombre de campo`, { campo: proto });
  const r = esquema.safeParse(valor);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ErrorDeDominio('VALIDACION', `${i.path.join('.')}: ${i.message}`, { campo: i.path.join('.') });
  }
  return r.data;
}

/** Ruta del primer campo propio `__proto__` del valor, o undefined si no hay ninguno. */
function rutaDeProto(valor: unknown, ruta: string[] = []): string | undefined {
  if (valor === null || typeof valor !== 'object') return undefined;
  if (!Array.isArray(valor) && Object.hasOwn(valor, '__proto__')) return [...ruta, '__proto__'].join('.');
  for (const [campo, v] of Object.entries(valor)) {
    const encontrada = rutaDeProto(v, [...ruta, campo]);
    if (encontrada !== undefined) return encontrada;
  }
  return undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Idempotency-Key obligatoria y UUID (000 §4.1: la genera el cliente por intento). */
export function claveObligatoria(clave: string | undefined): string {
  if (!clave) throw new ErrorDeDominio('VALIDACION', 'Idempotency-Key: es obligatoria', { campo: 'Idempotency-Key' });
  if (!UUID.test(clave)) throw new ErrorDeDominio('VALIDACION', 'Idempotency-Key: debe ser un UUID', { campo: 'Idempotency-Key' });
  return clave;
}

/**
 * Los parámetros de consulta llegan como texto: `'true'` y `'false'` pasan a booleano antes de validar con el esquema
 * del contrato. Cualquier otro valor queda como texto y el esquema lo rechaza (400). No se usa z.coerce.boolean, que
 * convierte `'false'` en true.
 */
export function conBooleanos(q: unknown, campos: string[]): unknown {
  if (!q || typeof q !== 'object') return q;
  const r: Record<string, unknown> = { ...(q as Record<string, unknown>) };
  for (const c of campos) {
    if (r[c] === 'true') r[c] = true;
    else if (r[c] === 'false') r[c] = false;
  }
  return r;
}

/** Cursor opaco (000 §4): el último id de la página (un UUID) en base64url. */
export const aCursor = (id: string) => Buffer.from(id).toString('base64url');

/**
 * El id de un cursor de `aCursor`. Uno que no salió de aquí (no es base64url de un UUID) es 400 VALIDACION, como en
 * Viajes: antes daba una página vacía y terminada, o se ignoraba.
 */
export function desdeCursor(c?: string): string | undefined {
  if (!c) return undefined;
  const id = Buffer.from(c, 'base64url').toString('utf8');
  if (!UUID.test(id) || aCursor(id) !== c) throw new ErrorDeDominio('VALIDACION', 'cursor: no es válido', { campo: 'cursor' });
  return id;
}
