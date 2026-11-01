import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  AvisoServicios,
  controlLista,
  Encabezado,
  Estado,
  etiqueta,
  EtiquetaPipe,
  FechaPipe,
  FiltrosLista,
  LIMITE_GATEWAY,
  PieLista,
  posicionEstado,
  Sesion,
} from 'ui-comun';
import { puedeCerrar, textoMantenimiento, type FilaMantenimiento } from '../domain/mantenimiento';
import { MantenimientosFachada } from '../mantenimientos.fachada';

/** G9: todos los mantenimientos. Programar y cerrar viven en la ficha de la unidad, a la que lleva cada fila. */
@Component({
  selector: 'app-mantenimientos',
  providers: [MantenimientosFachada],
  imports: [
    Encabezado,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado titulo="Mantenimientos" subtitulo="Para programar uno nuevo, abre la unidad." />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!mantenimientos().length" />
    <cc-filtros-lista
      [control]="lista"
      busqueda="Buscar por placa, tipo o taller"
      grupo="EstadoMantenimiento"
      nombre="mantenimientos"
      singular="mantenimiento"
      [limite]="limite"
      corte="recientes"
    />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Mantenimientos">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Unidad</th>
          <td mat-cell *matCellDef="let m">
            <a [routerLink]="['/unidades', m.unidadId]">{{ m.placa }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="tipo"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo</th>
          <td mat-cell *matCellDef="let m">{{ m.tipo | etiqueta: 'TipoMantenimiento' }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Fecha programada</th>
          <td mat-cell *matCellDef="let m">{{ m.fechaProgramada | fecha }}</td></ng-container
        >
        <ng-container matColumnDef="taller"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Taller</th>
          <td mat-cell *matCellDef="let m">
            {{ m.taller }} <span class="secundario">{{ m.descripcion }}</span>
          </td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let m">
            <cc-estado grupo="EstadoMantenimiento" [valor]="m.estado" />
            @if (m.cerradoEn) {
              <span class="secundario"> {{ m.cerradoEn | fecha: true }}</span>
            }
          </td></ng-container
        >
        <ng-container matColumnDef="acciones">
          <th mat-header-cell *matHeaderCellDef><span class="cdk-visually-hidden">Acciones</span></th>
          <td mat-cell *matCellDef="let m">
            @if (puedeCerrar(m) && sesion.tiene('jefe_flota')) {
              <a mat-button [routerLink]="['/unidades', m.unidadId]"
                >Cerrar en la unidad <span class="cdk-visually-hidden">{{ m.placa }}</span></a
              >
            }
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let m; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista
      [control]="lista"
      nombre="mantenimientos"
      vacio="No hay mantenimientos registrados."
      [error]="error()"
      [cargando]="cargando()"
    />
  `,
})
export class MantenimientosPagina {
  private readonly fachada = inject(MantenimientosFachada);
  readonly sesion = inject(Sesion);
  readonly mantenimientos = this.fachada.mantenimientos;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { mantenimientos: 'Flota' };
  readonly columnas = ['placa', 'tipo', 'fecha', 'taller', 'estado', 'acciones'];
  readonly puedeCerrar = puedeCerrar;
  readonly limite = LIMITE_GATEWAY;
  readonly lista = controlLista<FilaMantenimiento>({
    filas: this.mantenimientos,
    texto: textoMantenimiento,
    estado: (m) => m.estado,
    orden: {
      placa: (m) => m.placa,
      tipo: (m) => etiqueta('TipoMantenimiento', m.tipo).texto,
      fecha: (m) => m.fechaProgramada,
      taller: (m) => m.taller,
      estado: (m) => posicionEstado('EstadoMantenimiento', m.estado),
    },
    ordenInicial: { orden: 'fecha', dir: 'desc' },
  });
}
