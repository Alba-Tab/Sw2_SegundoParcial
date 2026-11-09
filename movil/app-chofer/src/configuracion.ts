import Constants from 'expo-constants';

interface Extra {
  entorno: 'local' | 'nube';
  viajesUrl: string;
  flotaUrl: string;
  oidcIssuer: string;
}

/** Las URL que puso app.config.ts según APP_ENTORNO. */
const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const configuracion = {
  entorno: extra.entorno ?? 'local',
  viajesUrl: extra.viajesUrl ?? '',
  flotaUrl: extra.flotaUrl ?? '',
  oidcIssuer: extra.oidcIssuer ?? '',
  clienteOidc: 'app-chofer',
  redireccion: 'transporte-chofer://sesion',
};
