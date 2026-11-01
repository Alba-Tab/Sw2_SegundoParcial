import { Component, computed, inject, input } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { aCentavos, AvisoServicios, BobPipe, controlLista, Encabezado, FechaPipe, FiltrosLista, PieLista, NumeroPipe } from 'ui-comun';
import { CombustibleFachada } from '../combustible.fachada';
import type { Anomalia, Carga } from '../domain/combustible';

/** Anomalías de Isolation Forest (FF2) y las últimas cargas. Una alerta abre aquí con la carga marcada. */
@Component({
  selector: 'app-combustible',
  providers: [CombustibleFachada],
  imports: [Encabezado, MatTableModule, MatSortModule, NumeroPipe, BobPipe, FechaPipe, AvisoServicios, FiltrosLista, PieLista],
  template: `
    <cc-encabezado
      [titulo]="id() ? 'Carga marcada' : 'Combustible'"
      [migas]="id() ? [{ texto: 'Combustible', ruta: '/combustible' }, { texto: 'Carga marcada' }] : []"
    />
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!anomalias().length && !cargas().length" />
    @if (id()) {
      @let a = anomaliaMarcada();
      @let c = cargaMarcada();
      @if (a || c) {
        <h2>Detalle de la carga</h2>
        <dl class="datos">
          <div>
            <dt>Placa</dt>
            <dd>{{ a?.placa ?? c?.placa }}</dd>
          </div>
          <div>
            <dt>Registrada</dt>
            <dd>{{ a?.registradaEn ?? c?.registradaEn | fecha: true }}</dd>
          </div>
          <div>
            <dt>Litros</dt>
            <dd>{{ a?.litros ?? c?.litros | numero: 1 }}</dd>
          </div>
          @if (a) {
            <div>
              <dt>Km/L</dt>
              <dd>{{ a.kmPorLitro | numero: 2 : 2 }}</dd>
            </div>
            <div>
              <dt>Puntaje de anomalía</dt>
              <dd>{{ a.puntaje | numero: 2 : 2 }}</dd>
            </div>
          }
          @if (c) {
            <div>
              <dt>Monto</dt>
              <dd>{{ c.monto | bob }}</dd>
            </div>
            <div>
              <dt>Odómetro</dt>
              <dd>{{ c.kilometraje | numero }} km</dd>
            </div>
          }
        </dl>
      }
    }
    <h2>Anomalías de los últimos 30 días</h2>
    <cc-filtros-lista
      [control]="listaA"
      [cargando]="cargando()"
      busqueda="Buscar anomalías por placa"
      nombre="anomalías"
      singular="anomalía"
    />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Anomalías de combustible">
      <table
        mat-table
        [dataSource]="listaA.visibles()"
        matSort
        [matSortActive]="listaA.orden()"
        [matSortDirection]="listaA.dir()"
        (matSortChange)="listaA.ordenarPor($event)"
      >
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Placa</th>
          <td mat-cell *matCellDef="let a">{{ a.placa }}</td></ng-container
        >
        <ng-container matColumnDef="litros"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Litros</th>
          <td mat-cell *matCellDef="let a">{{ a.litros | numero: 1 }}</td></ng-container
        >
        <ng-container matColumnDef="kmPorLitro"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Km/L</th>
          <td mat-cell *matCellDef="let a">{{ a.kmPorLitro | numero: 2 : 2 }}</td></ng-container
        >
        <ng-container matColumnDef="puntaje"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Puntaje</th>
          <td mat-cell *matCellDef="let a">{{ a.puntaje | numero: 2 : 2 }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Registrada</th>
          <td mat-cell *matCellDef="let a">{{ a.registradaEn | fecha: true }}</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnasA"></tr>
        <tr mat-row *matRowDef="let a; columns: columnasA" [class.marcada]="a.cargaId === id()"></tr>
      </table>
    </div>
    <cc-pie-lista
      [control]="listaA"
      nombre="anomalías"
      vacio="Sin anomalías en los últimos 30 días."
      [error]="error()"
      [cargando]="cargando()"
    />
    <h2>Últimas cargas</h2>
    <cc-filtros-lista [control]="listaC" [cargando]="cargando()" busqueda="Buscar cargas por placa" nombre="cargas" singular="carga" />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Cargas de combustible">
      <table
        mat-table
        [dataSource]="listaC.visibles()"
        matSort
        [matSortActive]="listaC.orden()"
        [matSortDirection]="listaC.dir()"
        (matSortChange)="listaC.ordenarPor($event)"
      >
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Placa</th>
          <td mat-cell *matCellDef="let c">{{ c.placa }}</td></ng-container
        >
        <ng-container matColumnDef="litros"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Litros</th>
          <td mat-cell *matCellDef="let c">{{ c.litros | numero: 1 }}</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Monto</th>
          <td mat-cell *matCellDef="let c">{{ c.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="km"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Odómetro</th>
          <td mat-cell *matCellDef="let c">{{ c.kilometraje | numero }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Registrada</th>
          <td mat-cell *matCellDef="let c">{{ c.registradaEn | fecha: true }}</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnasC"></tr>
        <tr mat-row *matRowDef="let c; columns: columnasC" [class.marcada]="c.cargaId === id()"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="listaC" nombre="cargas" vacio="Sin cargas registradas." [error]="error()" [cargando]="cargando()" />
  `,
})
export class CombustiblePagina {
  readonly id = input<string>();
  private readonly fachada = inject(CombustibleFachada);
  readonly anomalias = this.fachada.anomalias;
  readonly cargas = this.fachada.cargas;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly campos = { anomaliasCombustible: 'Analítica', cargasCombustible: 'Flota' };
  /** La carga a la que lleva la alerta (`/combustible/:id`), arriba y sin depender de la página de la tabla. */
  readonly anomaliaMarcada = computed(() => this.anomalias().find((a) => a.cargaId === this.id()));
  readonly cargaMarcada = computed(() => this.cargas().find((c) => c.cargaId === this.id()));
  readonly columnasA = ['placa', 'litros', 'kmPorLitro', 'puntaje', 'fecha'];
  readonly columnasC = ['placa', 'litros', 'monto', 'km', 'fecha'];
  // Dos listas en la página: cada una con su prefijo en la URL.
  readonly listaA = controlLista<Anomalia>({
    filas: this.anomalias,
    texto: (a) => a.placa ?? '',
    orden: {
      placa: (a) => a.placa,
      litros: (a) => a.litros,
      kmPorLitro: (a) => a.kmPorLitro,
      puntaje: (a) => a.puntaje,
      fecha: (a) => a.registradaEn,
    },
    ordenInicial: { orden: 'fecha', dir: 'desc' },
    prefijo: 'anomalias-',
  });
  readonly listaC = controlLista<Carga>({
    filas: this.cargas,
    texto: (c) => c.placa ?? '',
    orden: {
      placa: (c) => c.placa,
      litros: (c) => c.litros,
      monto: (c) => aCentavos(c.monto),
      km: (c) => c.kilometraje,
      fecha: (c) => c.registradaEn,
    },
    ordenInicial: { orden: 'fecha', dir: 'desc' },
    prefijo: 'cargas-',
  });
}
