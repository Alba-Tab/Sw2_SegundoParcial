import { etiqueta, type Icono, pct, puedeVer, type Tono } from 'ui-comun/dominio';
import type { TableroQueryVariables } from '../../graphql/generado';

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

/**
 * Las variables `@include` de la consulta del tablero: qué bloques se piden y se muestran según los roles del token, con
 * los `@roles` del esquema (spec 016, "Lectura por rol"). Así un rol no ve una tarjeta en blanco ni genera un
 * `SIN_PERMISO` en cada sondeo.
 */
export function bloquesVisibles(roles: readonly string[]): Omit<TableroQueryVariables, 'periodo'> {
  return {
    verViajes: puedeVer(roles, 'viajesEnCurso'),
    verRiesgo: puedeVer(roles, 'riesgo'),
    verUnidades: puedeVer(roles, 'unidadesPorEstado'),
    verCobranza: puedeVer(roles, 'cuentasPorCobrar'),
    verAlertas: puedeVer(roles, 'alertasAbiertas'),
  };
}

export type Bloques = ReturnType<typeof bloquesVisibles>;

/** ¿El rol ve algún bloque que pueda pedir acción? Si no (comercial), "Nada pide acción" sería una afirmación falsa (C-5). */
export const conPendientes = (b: Bloques): boolean => !!((b.verViajes && b.verRiesgo) || b.verCobranza || b.verUnidades || b.verAlertas);

/** Cómo se ve una tarjeta cuando su bloque salió en null: servicio caído (FR1, FR2) o rol sin acceso. */
export type EstadoTarjeta = 'no-disponible' | 'sin-acceso' | null;

/** Lo que el tablero lee de cada bloque; la respuesta puede llegar parcial si un servicio cae (FR1, FR2). */
export interface LecturaTablero {
  viajesEnCurso?:
    | readonly ({
        viajeId?: string;
        placa?: string | null;
        cliente?: { razonSocial?: string | null } | null;
        ruta?: { nombre?: string | null } | null;
        riesgo?: { probabilidad?: number | null; enRiesgo?: boolean | null } | null;
      } | null)[]
    | null;
  unidadesPorEstado?: readonly ({ estado?: string; cantidad?: number } | null)[] | null;
  cuentasPorCobrar?: { facturasVencidas?: number | null; facturasPorVencer?: number | null } | null;
  alertasAbiertas?: number | null;
}

/** Una línea de "Pide acción": qué pasa y a dónde ir a resolverlo (la app destino y su ruta; sin app, no hay enlace). */
export interface Pendiente {
  clave: string;
  icono: Icono;
  tono: Tono;
  texto: string;
  detalle?: string;
  app?: 'cc-operaciones' | 'cc-flota' | 'cc-finanzas';
  ruta?: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * U7: lo que pide acción, en orden de urgencia: viajes en riesgo (el más probable primero), facturas vencidas,
 * unidades con mantenimiento pendiente y alertas abiertas. Un bloque que el rol no ve no aparece; uno cuyo servicio
 * cayó lo dice ("no se sabe"), para que la ausencia de pendientes no se lea como "todo bien".
 */
export function pendientes(t: LecturaTablero | null | undefined, b: Bloques, estado: (campo: string) => EstadoTarjeta): Pendiente[] {
  const lista: Pendiente[] = [];
  const caido = (campo: string, servicio: string, que: string) => {
    const e = estado(campo);
    if (e)
      lista.push({
        clave: `sin-${campo}`,
        icono: 'cloud_off',
        tono: 'neutro',
        texto: e === 'sin-acceso' ? `Sin acceso a ${que}` : `${servicio} no disponible`,
        detalle: e === 'sin-acceso' ? undefined : `No se puede saber si hay ${que}.`,
      });
    return !!e;
  };

  if (b.verViajes && b.verRiesgo && !caido('viajesEnCurso', 'Viajes', 'viajes en riesgo')) {
    const enRiesgo = (t?.viajesEnCurso ?? [])
      .filter((v) => v?.riesgo?.enRiesgo)
      .sort((x, y) => (y?.riesgo?.probabilidad ?? 0) - (x?.riesgo?.probabilidad ?? 0));
    for (const v of enRiesgo)
      lista.push({
        clave: `riesgo-${v!.viajeId}`,
        // El mismo ícono y tono que el chip de riesgo (aviso): es una predicción, no una falla.
        icono: etiqueta('Riesgo', 'EN_RIESGO').icono,
        tono: etiqueta('Riesgo', 'EN_RIESGO').tono,
        texto: `Viaje ${v!.placa ?? 'sin unidad'} en riesgo de retraso (${pct(v!.riesgo?.probabilidad)})`,
        detalle: [v!.cliente?.razonSocial, v!.ruta?.nombre].filter(Boolean).join(' · ') || undefined,
        app: 'cc-operaciones',
        ruta: `/viajes/${v!.viajeId}`,
      });
  }
  if (b.verCobranza && !caido('cuentasPorCobrar', 'Finanzas', 'facturas en mora')) {
    const n = t?.cuentasPorCobrar?.facturasVencidas ?? 0;
    if (n > 0)
      lista.push({
        clave: 'mora',
        icono: 'event_busy',
        tono: 'error',
        texto: `${plural(n, 'factura vencida', 'facturas vencidas')} por cobrar`,
        app: 'cc-finanzas',
        ruta: '/cobranza',
      });
  }
  if (b.verUnidades && !caido('unidadesPorEstado', 'Flota', 'unidades con mantenimiento pendiente')) {
    const n = t?.unidadesPorEstado?.find((u) => u?.estado === 'MANTENIMIENTO_PENDIENTE')?.cantidad ?? 0;
    if (n > 0)
      lista.push({
        clave: 'mantenimiento',
        icono: etiqueta('EstadoUnidad', 'MANTENIMIENTO_PENDIENTE').icono,
        tono: 'aviso',
        texto: `${plural(n, 'unidad', 'unidades')} con mantenimiento pendiente`,
        detalle: 'No sale de viaje hasta programar el mantenimiento.',
        app: 'cc-flota',
        ruta: '/unidades?estado=MANTENIMIENTO_PENDIENTE',
      });
  }
  if (b.verAlertas && !caido('alertasAbiertas', 'Analítica', 'alertas abiertas')) {
    const n = t?.alertasAbiertas ?? 0;
    if (n > 0)
      lista.push({
        clave: 'alertas',
        icono: 'notifications',
        tono: 'aviso',
        texto: plural(n, 'alerta abierta', 'alertas abiertas'),
        detalle: 'Se revisan y se marcan atendidas desde la campana de la barra.',
      });
  }
  return lista;
}
