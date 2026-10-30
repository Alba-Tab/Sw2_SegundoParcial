import { type ApplicationConfig, provideAppInitializer, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, type Routes, withComponentInputBinding } from '@angular/router';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { proveerApollo } from './apollo';
import { CONFIG_CENTRO, type ConfigCentro } from './configuracion';
import { Sesion } from './sesion';

/** Lo común de cada app: configuración, sesión (antes de arrancar), Apollo hacia el Gateway y el router. */
export function configurarApp(config: ConfigCentro, rutas: Routes): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: CONFIG_CENTRO, useValue: config },
      { provide: MAT_DATE_LOCALE, useValue: 'es-BO' },
      provideHttpClient(),
      provideAppInitializer(() => inject(Sesion).iniciar()),
      ...proveerApollo(),
      provideRouter(rutas, withComponentInputBinding()),
    ],
  };
}
