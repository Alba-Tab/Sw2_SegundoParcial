/** Variables de entorno del Gateway (sin secretos en el repo: .env.example). */
export interface Configuracion {
  puerto: number;
  issuer: string;
  audiencia: string;
  clienteSecreto: string;
  viajesUrl: string;
  flotaUrl: string;
  finanzasUrl: string;
  analiticaUrl: string;
  gatewayUrl: string;
  corsOrigenes: string[];
  hmacSecreto: string;
  introspeccion: boolean;
  esquema: string;
}

export function configuracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  return {
    puerto: Number(env.PORT ?? 8105),
    issuer: (env.OIDC_ISSUER ?? '').replace(/\/$/, ''),
    audiencia: 'gateway',
    clienteSecreto: env.OIDC_CLIENTE_SECRETO ?? '',
    viajesUrl: env.VIAJES_URL ?? 'http://localhost:8101',
    flotaUrl: env.FLOTA_URL ?? 'http://localhost:8102',
    finanzasUrl: env.FINANZAS_URL ?? 'http://localhost:8103',
    analiticaUrl: env.ANALITICA_URL ?? 'http://localhost:8104',
    gatewayUrl: (env.GATEWAY_URL ?? 'http://localhost:8105').replace(/\/$/, ''),
    corsOrigenes: (env.CORS_ORIGENES ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    hmacSecreto: env.EXPORTACION_HMAC_SECRETO ?? '',
    // Introspección apagada salvo que se pida (spec 016). El Code Generator de las apps lee el archivo del esquema.
    introspeccion: env.GRAPHQL_INTROSPECCION === 'true',
    esquema: env.ESQUEMA_GRAPHQL ?? `${__dirname}/../../../contratos/graphql/centro-control.graphql`,
  };
}
