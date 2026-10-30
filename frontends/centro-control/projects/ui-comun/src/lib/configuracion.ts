import { InjectionToken } from '@angular/core';

export type App = 'cc-tablero' | 'cc-operaciones' | 'cc-flota' | 'cc-finanzas';

/**
 * Configuración de cada app, leída de `/configuracion.json` antes de arrancar: en la nube se cambia el archivo del
 * hosting sin recompilar. Cada app usa su propio cliente OIDC (propuesta 7.1).
 */
export interface ConfigCentro {
  app: App;
  oidcIssuer: string;
  clienteOidc: string;
  gatewayUrl: string;
  /** URL de cada app del Centro de Control y del portal (las apps solo se enlazan por URL). */
  urls: Record<App | 'portal-cliente', string>;
}

export const CONFIG_CENTRO = new InjectionToken<ConfigCentro>('CONFIG_CENTRO');

export const NOMBRES_APPS: Record<App, string> = {
  'cc-tablero': 'Tablero',
  'cc-operaciones': 'Operaciones',
  'cc-flota': 'Flota',
  'cc-finanzas': 'Finanzas',
};

/** Qué apps ve cada rol en la barra (propuesta 6.1). */
export const APPS_POR_ROL: Record<string, App[]> = {
  gerente: ['cc-tablero', 'cc-operaciones', 'cc-flota', 'cc-finanzas'],
  despachador: ['cc-tablero', 'cc-operaciones'],
  jefe_flota: ['cc-tablero', 'cc-flota'],
  administracion: ['cc-tablero', 'cc-finanzas'],
  comercial: ['cc-tablero', 'cc-operaciones'],
};

/** Destino después del login en cc-tablero (spec 016, paso 2). */
export const DESTINO_POR_ROL: [string, App][] = [
  ['gerente', 'cc-tablero'],
  ['despachador', 'cc-operaciones'],
  ['jefe_flota', 'cc-flota'],
  ['administracion', 'cc-finanzas'],
  ['comercial', 'cc-operaciones'],
];

export async function cargarConfiguracion(): Promise<ConfigCentro> {
  const r = await fetch('/configuracion.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('No se pudo leer /configuracion.json');
  return (await r.json()) as ConfigCentro;
}
