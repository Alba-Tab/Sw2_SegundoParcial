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
      ...proveerApollo(),
      provideRouter(rutas, withComponentInputBinding()),
    ],
  };
}

/**
 * Si la configuración no carga, la app no arranca: se dice en una frase, sin el mensaje técnico (que va a la consola),
 * con estilos propios (los de Material aún no están) y con "Reintentar". Aquí sí se recarga: no hay nada escrito.
 */
export function mostrarFalloArranque(app: string, error: unknown, doc: Document = document): void {
  console.error(error);
  const caja = doc.createElement('main');
  caja.setAttribute('role', 'alert');
  caja.style.cssText = 'font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 64px auto; padding: 0 16px';
  const texto = doc.createElement('p');
  texto.textContent = `No se pudo iniciar ${app}: no se pudo leer la configuración. Revisa tu conexión e intenta de nuevo.`;
  const boton = doc.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Reintentar';
  boton.style.cssText = 'font: inherit; min-height: 44px; padding: 0 16px; cursor: pointer';
  boton.addEventListener('click', () => doc.defaultView?.location.reload());
  caja.append(texto, boton);
  doc.body.replaceChildren(caja);
}
