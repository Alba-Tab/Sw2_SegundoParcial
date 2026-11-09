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
  /** `lineaCredito` y `Cliente.lineaCredito`. */
  lineaCredito: ['gerente', 'administracion', 'comercial'],
  /** `clientes`. */
  clientes: ['gerente', 'despachador', 'administracion', 'comercial'],
} as const satisfies Record<string, readonly string[]>;

export type CampoConRoles = keyof typeof ROLES_CAMPO;

/** ¿Alguno de los roles del token está entre los que permite el campo? */
export const puedeVer = (roles: readonly string[], campo: CampoConRoles): boolean =>
  roles.some((r) => (ROLES_CAMPO[campo] as readonly string[]).includes(r));

/** Cada rol interno como lo nombra una persona («las ven gerencia y administración»). */
const ROL_EN_FRASE: Record<string, string> = {
  gerente: 'gerencia',
  despachador: 'despacho',
  jefe_flota: 'jefatura de flota',
  administracion: 'administración',
  comercial: 'comercial',
};

/** Quiénes ven el campo según `ROLES_CAMPO` (la misma tabla que `puedeVer`): "gerencia y administración". */
export function quienesVen(campo: CampoConRoles): string {
  const nombres = ROLES_CAMPO[campo].map((r) => ROL_EN_FRASE[r] ?? r);
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres.join('');
}
