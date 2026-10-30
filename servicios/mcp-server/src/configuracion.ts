/** Variables de entorno del servidor MCP (sin secretos en el repo). */
export function configuracion(env: NodeJS.ProcessEnv = process.env) {
  return {
    puerto: Number(env.PORT ?? 8106),
    issuer: (env.OIDC_ISSUER ?? '').replace(/\/$/, ''),
    audiencia: 'mcp-server',
    clienteSecreto: env.OIDC_CLIENTE_SECRETO ?? '',
    /** Clientes que pueden llamar al MCP (spec 014): el agente y Analítica; el Gateway solo con el plan B de voz. */
    clientes: (env.MCP_CLIENTES ?? 'agente,analitica').split(',').map((c) => c.trim()),
    viajesUrl: env.VIAJES_URL ?? 'http://localhost:8101',
    flotaUrl: env.FLOTA_URL ?? 'http://localhost:8102',
    finanzasUrl: env.FINANZAS_URL ?? 'http://localhost:8103',
    analiticaUrl: env.ANALITICA_URL ?? 'http://localhost:8104',
    limitePorMinuto: Number(env.MCP_LIMITE_POR_MINUTO ?? 30),
  };
}
export type Configuracion = ReturnType<typeof configuracion>;
