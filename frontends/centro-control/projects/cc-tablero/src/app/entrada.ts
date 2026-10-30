import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { CONFIG_CENTRO, DESTINO_POR_ROL, Sesion } from 'ui-comun';

/**
 * cc-tablero es la puerta de entrada (spec 016, paso 2): después del login, cada rol va a su app. El gerente se queda.
 * Solo redirige al entrar por la raíz, para que el gerente pueda volver al tablero desde la barra.
 */
export const entrada: CanActivateFn = (_ruta, estado) => {
  const sesion = inject(Sesion);
  const config = inject(CONFIG_CENTRO);
  const destino = DESTINO_POR_ROL.find(([rol]) => sesion.tiene(rol))?.[1];
  const vieneDeOtraApp =
    document.referrer && !document.referrer.startsWith(config.urls['cc-tablero']) && !document.referrer.includes('/realms/');
  if (estado.url === '/' && destino && destino !== 'cc-tablero' && !vieneDeOtraApp) {
    window.location.assign(config.urls[destino]);
    return false;
  }
  return true;
};
