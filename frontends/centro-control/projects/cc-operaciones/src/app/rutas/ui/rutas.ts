import { Component, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AvisoServicios, controlLista, Encabezado, FiltrosLista, PieLista, NumeroPipe } from 'ui-comun';
import { textoRuta, type Ruta } from '../domain/ruta';
import { RutasFachada } from '../rutas.fachada';

/** G4: rutas de la empresa (Viajes). Solo lectura hasta que el backend tenga alta y edición. */
@Component({
  selector: 'app-rutas',
  providers: [RutasFachada],
  imports: [Encabezado, MatTableModule, MatSortModule, RouterLink, NumeroPipe, AvisoServicios, FiltrosLista, PieLista],
  template: `
    <cc-encabezado titulo="Rutas" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!rutas().length" />
    <cc-filtros-lista
      [control]="lista"
      [cargando]="cargando()"
      busqueda="Buscar por nombre, origen o destino"
      nombre="rutas"
      singular="ruta"
    />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Rutas">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="nombre"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Ruta</th>
          <td mat-cell *matCellDef="let r">
            <a [routerLink]="['/rutas', r.rutaId]">{{ r.nombre }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="origen"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Origen</th>
          <td mat-cell *matCellDef="let r">{{ r.origen }}</td></ng-container
        >
        <ng-container matColumnDef="destino"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Destino</th>
          <td mat-cell *matCellDef="let r">{{ r.destino }}</td></ng-container
        >
        <ng-container matColumnDef="distancia"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Distancia</th>
          <td mat-cell *matCellDef="let r">{{ r.distanciaKm | numero: 1 }} km</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let r; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="rutas" vacio="No hay rutas registradas." [error]="error()" [cargando]="cargando()" />
  `,
})
export class RutasPagina {
  private readonly fachada = inject(RutasFachada);
  readonly rutas = this.fachada.rutas;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { rutas: 'Viajes' };
  readonly columnas = ['nombre', 'origen', 'destino', 'distancia'];
  readonly lista = controlLista<Ruta>({
    filas: this.rutas,
    texto: textoRuta,
    orden: {
      nombre: (r) => r.nombre,
      origen: (r) => r.origen,
      destino: (r) => r.destino,
      distancia: (r) => r.distanciaKm,
    },
    ordenInicial: { orden: 'nombre', dir: 'asc' },
  });
}
