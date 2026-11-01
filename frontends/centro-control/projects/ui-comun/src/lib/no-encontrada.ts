import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CONFIG_CENTRO, NOMBRES_APPS } from './configuracion';

/** La ruta `**` de cada app (N4): dice que el enlace no lleva a ninguna página y ofrece la portada, sin redirigir en silencio. */
@Component({
  selector: 'cc-no-encontrada',
  imports: [MatButtonModule, RouterLink],
  template: `
    <section class="no-encontrada">
      <h1>No encontramos esta página</h1>
      <p>El enlace puede estar incompleto o la página ya no existe.</p>
      <a mat-flat-button routerLink="/">Ir al inicio de {{ nombre }}</a>
    </section>
  `,
  styles: `
    .no-encontrada {
      max-width: 520px;
      margin: 64px auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }
  `,
})
export class NoEncontrada {
  readonly nombre = NOMBRES_APPS[inject(CONFIG_CENTRO).app];
}
