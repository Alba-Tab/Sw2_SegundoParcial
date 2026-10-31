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
