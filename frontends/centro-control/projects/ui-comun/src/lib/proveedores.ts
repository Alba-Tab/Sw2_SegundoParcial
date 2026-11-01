import { type ApplicationConfig, provideAppInitializer, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, type Routes, withComponentInputBinding } from '@angular/router';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { proveerApollo } from './apollo';
import { CONFIG_CENTRO, type ConfigCentro } from './configuracion';
import { PaginadorEs } from './lista';
import { Sesion } from './sesion';

/** Lo común de cada app: configuración, sesión (antes de arrancar), Apollo hacia el Gateway y el router. */
export function configurarApp(config: ConfigCentro, rutas: Routes): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: CONFIG_CENTRO, useValue: config },
      { provide: MAT_DATE_LOCALE, useValue: 'es-BO' },
      // Los <mat-icon> usan Material Symbols (base.css), no la fuente clásica material-icons.
      { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
      { provide: MatPaginatorIntl, useClass: PaginadorEs },
      provideHttpClient(),
      provideAppInitializer(() => inject(Sesion).iniciar()),
      provideAppInitializer(() => void iconosListos()),
      ...proveerApollo(),
      provideRouter(rutas, withComponentInputBinding()),
    ],
  };
}

/**
 * Muestra los iconos cuando su fuente cargó (base.css los oculta antes), para que no se lea el nombre del glifo. Si la
 * fuente no llega, mejor un hueco que "check_circle" junto a cada estado: el texto del estado sigue a su lado.
 */
export async function iconosListos(doc: Document = document): Promise<boolean> {
  const listos = doc.fonts
    ? await doc.fonts.load("24px 'Material Symbols Outlined'", 'home').then(
        (f) => f.length > 0,
        () => false,
      )
    : true;
  if (listos) doc.documentElement.classList.add('iconos-listos');
  return listos;
}
