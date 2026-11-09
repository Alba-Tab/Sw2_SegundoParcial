/** Reglas de presentación del panel del agente (spec 014). Sin Angular ni Apollo. */

/** El enlace a la traza en Jaeger; sin `jaegerUrl` en configuracion.json no hay enlace. */
export function urlTraza(jaegerUrl: string | undefined, traceId: string): string | null {
  const base = jaegerUrl?.replace(/\/$/, '');
  return base ? `${base}/trace/${encodeURIComponent(traceId)}` : null;
}

/** El aviso cuando el disparo falla, según el `codigo` (FR4 y una misión ya en curso). */
export function mensajeDisparo(codigo: string | undefined, mensaje: string): string {
  if (codigo === 'LLM_NO_DISPONIBLE') return 'El asistente no está disponible (misión saltada)';
  if (codigo === 'CONFLICTO_ESTADO') return 'Ya hay una misión en curso';
  return mensaje;
}

/** Cada herramienta del MCP en una frase (JV-3): el nombre `snake_case` queda en el detalle técnico. */
const PASOS: Readonly<Record<string, string>> = {
  obtener_viajes_en_curso: 'Revisó los viajes en curso',
  obtener_riesgo_retraso: 'Consultó el riesgo de retraso de un viaje',
  obtener_estado_unidad: 'Revisó el estado de una unidad',
  buscar_bitacora: 'Leyó la bitácora de un viaje',
  obtener_anomalias_combustible: 'Revisó las anomalías de combustible',
  cuentas_por_cobrar: 'Consultó las cuentas por cobrar',
  ejecutar_reporte: 'Ejecutó un reporte',
  proponer_accion: 'Propuso una acción al despachador',
};

export const pasoLegible = (herramienta: string): string =>
  Object.hasOwn(PASOS, herramienta) ? PASOS[herramienta] : 'Usó una herramienta del sistema';

/**
 * La conclusión que se lee (JV-3): la del asistente si terminó bien y dijo algo más que «FIN». La de una misión fallida
 * es el texto de la excepción: va al detalle técnico; el motivo ya lo dice la etiqueta del código.
 */
export function conclusionLegible(conclusion: string | null | undefined, estado: string): string | null {
  const texto = conclusion?.trim();
  if (!texto || estado !== 'COMPLETADA' || /^fin\.?$/i.test(texto)) return null;
  return texto;
}
