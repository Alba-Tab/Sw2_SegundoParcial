import { Component, computed, effect, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  AvisoServicios,
  cargandoDe,
  columnasConEstado,
  controlLista,
  Encabezado,
  Estado,
  FechaPipe,
  FiltrosLista,
  PieLista,
  posicionEstado,
} from 'ui-comun';
import type { EstadoViaje } from '../../graphql/generado';
import { ESTADOS_VIAJE, textoViaje } from '../domain/viaje';
import { ViajesFachada } from '../viajes.fachada';
import { Vistas, VISTAS } from '../../vistas';

@Component({
  selector: 'app-viajes',
  providers: [ViajesFachada],
  imports: [Vistas, Encabezado, MatTableModule, MatSortModule, RouterLink, FechaPipe, Estado, AvisoServicios, FiltrosLista, PieLista],
  template: `
    <cc-encabezado titulo="Viajes" />
    <app-vistas [vistas]="vistas" nombre="Vistas de viajes" />
    @let r = datos();
    <cc-aviso-servicios [error]="r?.error" [datosAl]="r?.datosAl" [campos]="campos" [sinDatos]="!r?.data?.viajes?.length" />
    <cc-filtros-lista
      [control]="lista"
      [cargando]="cargandoDe(r)"
      busqueda="Buscar por placa, cliente, ruta o chofer"
      grupo="EstadoViaje"
      [valores]="estados"
      nombre="viajes"
      singular="viaje"
      [limite]="80"
      corte="antiguos"
      [estadoEnServidor]="true"
    />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Viajes">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Placa</th>
          <td mat-cell *matCellDef="let v">
            <a [routerLink]="['/viajes', v.viajeId]">{{ v.placa ?? 'Sin unidad' }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Cliente</th>
          <td mat-cell *matCellDef="let v">{{ v.cliente?.razonSocial ?? 'Sin dato' }}</td></ng-container
        >
        <ng-container matColumnDef="ruta"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Ruta</th>
          <td mat-cell *matCellDef="let v">{{ v.ruta?.nombre ?? 'Sin dato' }}</td></ng-container
        >
        <ng-container matColumnDef="chofer"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Chofer</th>
          <td mat-cell *matCellDef="let v">{{ v.choferNombre ?? 'Sin dato' }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Fecha</th>
          <td mat-cell *matCellDef="let v">{{ v.fechaViaje | fecha }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let v">
            <cc-estado grupo="EstadoViaje" [valor]="v.estado" /></td
        ></ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas()"></tr>
        <tr mat-row *matRowDef="let v; columns: columnas()"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="viajes" vacio="No hay viajes." [error]="r?.error" [cargando]="cargandoDe(r)" />
  `,
})
export class ViajesPagina {
  readonly vistas = VISTAS.viajes;
  private readonly fachada = inject(ViajesFachada);
  readonly estados = ESTADOS_VIAJE;
  readonly columnas = columnasConEstado(['placa', 'cliente', 'ruta', 'chofer', 'fecha', 'estado']);
  readonly datos = this.fachada.datos;
  readonly cargandoDe = cargandoDe;
  readonly lista = controlLista({
    filas: computed(() => this.datos()?.data?.viajes ?? []),
    texto: textoViaje,
    estado: (v) => v.estado,
    orden: {
      placa: (v) => v.placa,
      cliente: (v) => v.cliente?.razonSocial,
      ruta: (v) => v.ruta?.nombre,
      chofer: (v) => v.choferNombre,
      fecha: (v) => v.fechaViaje,
      estado: (v) => posicionEstado('EstadoViaje', v.estado),
    },
    ordenInicial: { orden: 'fecha', dir: 'desc' },
  });
  readonly campos = { viajes: 'Viajes' };

  constructor() {
    // El estado también filtra en el servidor (Viajes devuelve hasta 80 por consulta); de la URL solo un valor conocido.
    effect(() => {
      const e = this.lista.filtro().estado as EstadoViaje | null;
      this.fachada.estado.set(e && this.estados.includes(e) ? e : null);
    });
  }
}
