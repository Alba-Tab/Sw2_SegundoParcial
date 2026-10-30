/** Configuración del cliente confidencial que intercambia (por ejemplo `gateway` o `mcp-server`). */
export interface ConfigIntercambio {
  /** Emisor de Keycloak, por ejemplo `http://keycloak:8080/realms/transporte`. */
  issuer: string;
  clienteId: string;
  clienteSecreto: string;
  /** Segundos antes del vencimiento en que el token deja de servir desde la caché (spec 016: 30). */
  margenSegundos?: number;
  /** Tiempo de espera de cada pedido a Keycloak en ms (por defecto 5.000). */
  tiempoEsperaMs?: number;
  /** Para pruebas. */
  fetch?: typeof fetch;
  ahora?: () => number;
}

/** Error del intercambio con el código estable de 000 §5. */
export declare class ErrorIntercambio extends Error {
  readonly codigo: 'NO_AUTENTICADO' | 'SIN_PERMISO' | 'DEPENDENCIA_NO_DISPONIBLE';
  readonly status: number;
  constructor(codigo: ErrorIntercambio['codigo'], mensaje: string, status: number);
}

export declare class IntercambioToken {
  constructor(config: ConfigIntercambio);
  /**
   * Cambia el token del usuario por uno a su nombre con la audiencia del servicio (RFC 8693). No reenvía el token
   * recibido: cada servicio recibe uno propio. Caché por `sub` y audiencia hasta `margenSegundos` antes de vencer.
   */
  tokenPara(tokenUsuario: string, audiencia: string): Promise<string>;
  /** Token de la cuenta de servicio del propio cliente (client credentials), con caché. */
  tokenDeServicio(audiencia?: string): Promise<string>;
  /** Cantidad de entradas en la caché (para pruebas y métricas). */
  readonly tamanoCache: number;
}

/** Lee el payload de un JWT sin verificar la firma (el que llama ya lo validó). */
export declare function payload(token: string): Record<string, unknown>;
