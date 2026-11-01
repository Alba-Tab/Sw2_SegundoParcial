import { Component, computed, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AvisoServicios, controlLista, DatosAl, Encabezado, FechaPipe, FiltrosLista, PieLista, NumeroPipe } from 'ui-comun';
import { ConduccionFachada } from '../conduccion.fachada';
import { PUNTAJE_BAJO, type PuntajeChofer } from '../domain/conduccion';

/** D84: max(0, 100 − 10 × (frenadas + 2 × fatigas) × 100 / km), por chofer en la semana. */
@Component({
  selector: 'app-conduccion',
  providers: [ConduccionFachada],
  imports: [
    Encabezado,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    RouterLink,
    NumeroPipe,
    FechaPipe,
    AvisoServicios,
    FiltrosLista,
    PieLista,
    DatosAl,
  ],
  template: `
    <!-- FL-4: el mismo nombre que la pestaña. NG-5: la escala se dice, no se supone. -->
    <cc-encabezado
      titulo="Conducción"
      [subtitulo]="'Puntaje de 0 a 100 por chofer: 100 es sin frenadas bruscas ni alertas de fatiga; bajo ' + puntajeBajo + ' se marca.'"
    />
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!puntajes()" />
    @if (puntajes(); as p) {
      <p class="secundario">Semana del {{ p.desde | fecha }} al {{ p.hasta | fecha }}</p>
      <cc-datos-al [al]="p.datosAl" />
      <cc-filtros-lista [control]="lista" [cargando]="cargando()" busqueda="Buscar por chofer" nombre="choferes" singular="chofer" />
      <div class="tabla-ancha" role="region" tabindex="0" aria-label="Conducción por chofer">
        <table
          mat-table
          [dataSource]="lista.visibles()"
          matSort
          [matSortActive]="lista.orden()"
          [matSortDirection]="lista.dir()"
          (matSortChange)="lista.ordenarPor($event)"
        >
          <ng-container matColumnDef="nombre"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Chofer</th>
            <td mat-cell *matCellDef="let c">
              <a [routerLink]="['/choferes', c.choferId]">{{ c.nombre ?? c.choferId }}</a>
            </td></ng-container
          >
          <ng-container matColumnDef="frenadas"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Frenadas</th>
            <td mat-cell *matCellDef="let c">{{ c.frenadas }}</td></ng-container
          >
          <ng-container matColumnDef="fatigas"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Fatigas</th>
            <td mat-cell *matCellDef="let c">{{ c.fatigas }}</td></ng-container
          >
          <ng-container matColumnDef="km"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Km</th>
            <td mat-cell *matCellDef="let c">{{ c.km | numero: 0 }}</td></ng-container
          >
          <ng-container matColumnDef="puntaje"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Puntaje (0 a 100)</th>
            <td mat-cell *matCellDef="let c" [class.no-disponible]="c.puntaje < puntajeBajo">
              @if (c.puntaje < puntajeBajo) {
                <mat-icon class="icono-en-linea">warning</mat-icon>
              }
              {{ c.puntaje | numero: 1 }}
              @if (c.puntaje < puntajeBajo) {
                <span class="cdk-visually-hidden">, bajo {{ puntajeBajo }}</span>
              }
            </td></ng-container
          >
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let c; columns: columnas"></tr>
        </table>
      </div>
      <cc-pie-lista
        [control]="lista"
        nombre="choferes"
        vacio="Sin frenadas ni alertas de fatiga esta semana."
        [error]="error()"
        [cargando]="cargando()"
      />
    }
  `,
})
export class ConduccionPagina {
  private readonly fachada = inject(ConduccionFachada);
  readonly puntajes = this.fachada.puntajes;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly puntajeBajo = PUNTAJE_BAJO;
  readonly campos = { puntajesConduccion: 'Analítica' };
  readonly columnas = ['nombre', 'frenadas', 'fatigas', 'km', 'puntaje'];
  readonly lista = controlLista<PuntajeChofer>({
    filas: computed(() => this.puntajes()?.choferes ?? []),
    texto: (c) => c.nombre ?? c.choferId,
    orden: {
      nombre: (c) => c.nombre ?? c.choferId,
      frenadas: (c) => c.frenadas,
      fatigas: (c) => c.fatigas,
      km: (c) => c.km,
      puntaje: (c) => c.puntaje,
    },
    // Los puntajes más bajos primero: son los que piden una conversación con el chofer.
    ordenInicial: { orden: 'puntaje', dir: 'asc' },
  });
}
