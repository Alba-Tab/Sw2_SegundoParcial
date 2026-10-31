/**
 * Copia de los `@roles` de `contratos/graphql/centro-control.graphql` para los campos que las pantallas piden por fila o
 * en cada sondeo. Con `@include(if: …)` no se piden a un rol que no los puede ver, y el Gateway no devuelve un
 * `SIN_PERMISO` por fila cada vez. Quien decide sigue siendo el Gateway (tercera capa, propuesta 7.5); si cambia el
 * esquema, se cambia aquí.
 */
export const ROLES_CAMPO = {
  /** `Viaje.monto` y `Servicio.monto`. */
  monto: ['gerente', 'administracion', 'comercial'],
  /** `Viaje.riesgo`. */
  riesgo: ['gerente', 'despachador'],
  /** `Viaje.unidad`. */
  unidad: ['gerente', 'despachador', 'jefe_flota'],
  /** `Tablero.cuentasPorCobrar` (sin comercial: Finanzas le exige un `clienteId`). */
  cuentasPorCobrar: ['gerente', 'administracion'],
  /** `Tablero.viajesEnCurso` y las listas de viajes. */
  viajesEnCurso: ['gerente', 'despachador', 'jefe_flota', 'comercial'],
  /** `Tablero.unidadesPorEstado`. */
  unidadesPorEstado: ['gerente', 'despachador', 'jefe_flota'],
  /** `Tablero.alertasAbiertas` y `Tablero.datosAl`. */
  alertasAbiertas: ['gerente', 'despachador', 'jefe_flota', 'administracion'],
  /** `clientes`. */
  clientes: ['gerente', 'despachador', 'administracion', 'comercial'],
} as const satisfies Record<string, readonly string[]>;

export type CampoConRoles = keyof typeof ROLES_CAMPO;

/** ¿Alguno de los roles del token está entre los que permite el campo? */
export const puedeVer = (roles: readonly string[], campo: CampoConRoles): boolean =>
  roles.some((r) => (ROLES_CAMPO[campo] as readonly string[]).includes(r));
