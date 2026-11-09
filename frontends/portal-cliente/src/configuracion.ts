/** Variables de Vite (.env.example). El issuer debe ser el mismo host que validan Viajes y Finanzas (OIDC_ISSUER). */
export const configuracion = {
  oidcIssuer: import.meta.env.VITE_OIDC_ISSUER ?? 'http://localhost:8080/realms/transporte',
  clienteOidc: 'portal-cliente',
  viajesUrl: import.meta.env.VITE_VIAJES_URL ?? 'http://localhost:8101',
  finanzasUrl: import.meta.env.VITE_FINANZAS_URL ?? 'http://localhost:8103',
  /** cc-tablero, que redirige a cada rol interno a su app (R2F-13). */
  centroUrl: import.meta.env.VITE_CENTRO_URL ?? 'http://localhost:4201',
};
