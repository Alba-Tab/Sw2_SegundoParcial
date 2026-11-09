import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { CONFIG_CENTRO, DESTINO_POR_ROL, Sesion, type App } from 'ui-comun';

/** Marca de la sesión del navegador (sessionStorage): ya se hizo el salto de la primera entrada. */
export const MARCA_ENTRADA = 'cc-tablero.entrada';

export interface Entrada {
  url: string;
  destino: App | undefined;
  yaEntro: boolean;
  vieneDeOtraApp: boolean;
}

/** Solo la primera entrada por la raíz, y sin venir de otra app, lleva a cada rol a su app; el gerente se queda. */
export function debeRedirigir({ url, destino, yaEntro, vieneDeOtraApp }: Entrada): boolean {
  return url === '/' && !!destino && destino !== 'cc-tablero' && !yaEntro && !vieneDeOtraApp;
}

function leerMarca(): boolean {
  try {
    return sessionStorage.getItem(MARCA_ENTRADA) === '1';
  } catch {
    return false;
  }
}

function ponerMarca(): void {
  try {
    sessionStorage.setItem(MARCA_ENTRADA, '1');
  } catch {
    // sin sessionStorage queda solo la regla del referrer
  }
}

/**
 * cc-tablero es la puerta de entrada (spec 016, paso 2): después del login, cada rol va a su app y el gerente se
 * queda. Solo en la primera entrada de la sesión del navegador: después, el despachador o jefe de flota que vuelve al
 * tablero desde la barra (o abre /voz o /reportes) se queda aquí.
 */
export const entrada: CanActivateFn = (_ruta, estado) => {
  const sesion = inject(Sesion);
  const config = inject(CONFIG_CENTRO);
  const destino = DESTINO_POR_ROL.find(([rol]) => sesion.tiene(rol))?.[1];
  const vieneDeOtraApp =
    !!document.referrer && !document.referrer.startsWith(config.urls['cc-tablero']) && !document.referrer.includes('/realms/');
  const redirigir = debeRedirigir({ url: estado.url, destino, yaEntro: leerMarca(), vieneDeOtraApp });
  ponerMarca();
  if (redirigir && destino) {
    window.location.assign(config.urls[destino]);
    return false;
  }
  return true;
};
