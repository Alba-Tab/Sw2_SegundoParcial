import { puedeVer } from 'ui-comun/dominio';
import type { TableroQueryVariables } from '../../graphql/generado';

/**
 * Qué rol ve cada bloque del tablero. El esquema solo pone `@roles` en `cuentasPorCobrar`; los demás bloques los filtra
 * el servicio dueño (cuarta capa, propuesta 7.5), que responde 403 a un rol que no los puede ver:
 *   - viajes en curso: `listarViajes` de Viajes (despachador, comercial, gerente, jefe_flota);
 *   - unidades por estado: `listarUnidades` de Flota (jefe_flota, despachador, gerente);
 *   - alertas abiertas y "datos al": `listarAlertas` de Analítica (despachador, jefe_flota, administracion, gerente).
 * Así un rol no ve una tarjeta en blanco ni genera un `SIN_PERMISO` en cada sondeo.
 */
export const ROLES_BLOQUE = {
  viajesEnCurso: ['gerente', 'despachador', 'jefe_flota', 'comercial'],
  unidadesPorEstado: ['gerente', 'despachador', 'jefe_flota'],
  alertasAbiertas: ['gerente', 'despachador', 'jefe_flota', 'administracion'],
} as const satisfies Record<string, readonly string[]>;

/** Las páginas de cc-tablero y quién las usa (los enlaces del tablero y los guardas de las rutas). */
export const ROLES_PAGINA = {
  /** Catálogo de reportes: Analítica exige un rol interno sin comercial (spec 015, tabla del catálogo). */
  reportes: ['gerente', 'administracion', 'despachador', 'jefe_flota'],
  /** Spec 015, "Quién pregunta". */
  voz: ['gerente', 'administracion', 'despachador', 'jefe_flota'],
  /** Spec 014: el gerente y el despachador disparan la misión y ven el panel. */
  agente: ['gerente', 'despachador'],
} as const satisfies Record<string, readonly string[]>;

export type Pagina = keyof typeof ROLES_PAGINA;

const alguno = (roles: readonly string[], permitidos: readonly string[]) => roles.some((r) => permitidos.includes(r));

export const puedeAbrir = (roles: readonly string[], pagina: Pagina): boolean => alguno(roles, ROLES_PAGINA[pagina]);

/** Las variables `@include` de la consulta del tablero: qué bloques se piden y se muestran según los roles del token. */
export function bloquesVisibles(roles: readonly string[]): Omit<TableroQueryVariables, 'periodo'> {
  return {
    verViajes: alguno(roles, ROLES_BLOQUE.viajesEnCurso),
    verRiesgo: puedeVer(roles, 'riesgo'),
    verUnidades: alguno(roles, ROLES_BLOQUE.unidadesPorEstado),
    verCobranza: puedeVer(roles, 'cuentasPorCobrar'),
    verAlertas: alguno(roles, ROLES_BLOQUE.alertasAbiertas),
  };
}

export type Bloques = ReturnType<typeof bloquesVisibles>;

/** Cómo se ve una tarjeta cuando su bloque salió en null: servicio caído (FR1, FR2) o rol sin acceso. */
export type EstadoTarjeta = 'no-disponible' | 'sin-acceso' | null;
