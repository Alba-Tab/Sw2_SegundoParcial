import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { type CanActivateFn, Router } from '@angular/router';
import { CONFIG_CENTRO } from './configuracion';
import { Sesion } from './sesion';

/** Solo roles internos entran al Centro de Control (spec 016): cliente y chofer ven "Sin acceso" (FK1). */
export const soloInternos: CanActivateFn = () => {
  const sesion = inject(Sesion);
  return sesion.rolesInternos().length > 0 || inject(Router).parseUrl('/sin-acceso');
};

/** Cada app además pide sus roles; la cuarta capa la aplica el servicio dueño (propuesta 7.5). */
export const soloRoles =
  (...roles: string[]): CanActivateFn =>
  () =>
    inject(Sesion).tiene(...roles) || inject(Router).parseUrl('/sin-acceso');

@Component({
  selector: 'cc-sin-acceso',
  imports: [MatButtonModule],
  template: `
    <section class="sin-acceso">
      @if (sesion.tiene('cliente')) {
        <h1>Esta es el área interna de la empresa</h1>
        <p>Tus servicios, facturas y cotizaciones están en el portal del cliente.</p>
        <a mat-flat-button [href]="config.urls['portal-cliente']">Ir al portal</a>
      } @else {
        <h1>Tu cuenta no tiene acceso</h1>
        <p>Si crees que es un error, pide al administrador que revise tu rol.</p>
      }
      <button mat-button (click)="sesion.cerrar()">Cerrar sesión</button>
    </section>
  `,
  styles: `
    .sin-acceso {
      max-width: 520px;
      margin: 64px auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }
  `,
})
export class SinAcceso {
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
}
