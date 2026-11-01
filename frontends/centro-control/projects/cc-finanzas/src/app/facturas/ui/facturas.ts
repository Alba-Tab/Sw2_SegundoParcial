import { Component, effect, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  aCentavos,
  AvisoServicios,
  BobPipe,
  controlLista,
  Encabezado,
  Estado,
  FechaPipe,
  FiltrosLista,
  PieLista,
  posicionEstado,
} from 'ui-comun';
import { FacturasFachada } from '../facturas.fachada';

import { cambioDeSaldo, ESTADOS_CON_SALDO, textoVencida } from '../domain/filtro';
@Component({
  selector: 'app-facturas',
  providers: [FacturasFachada],
  imports: [
    Encabezado,
    MatTableModule,
    MatSortModule,
    MatButtonToggleModule,
    RouterLink,
    BobPipe,
    FechaPipe,
    Estado,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado titulo="Facturas" />
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!facturas().length" />
    <cc-filtros-lista
      [control]="lista"
      [cargando]="cargando()"
      busqueda="Buscar por número o cliente"
      grupo="EstadoFactura"
      [valores]="saldo() === 'todas' ? undefined : estadosConSaldo"
      nombre="facturas"
      singular="factura"
    >
      <mat-button-toggle-group
        [value]="saldo() === 'todas' ? 'todas' : 'con-saldo'"
        (change)="lista.poner(cambioDeSaldo($event.value, lista.filtro().estado))"
        aria-label="Facturas a mostrar"
      >
        <mat-button-toggle value="con-saldo">Con saldo</mat-button-toggle>
        <mat-button-toggle value="todas">Todas</mat-button-toggle>
      </mat-button-toggle-group>
    </cc-filtros-lista>
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Facturas">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="numero"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Factura</th>
          <td mat-cell *matCellDef="let f">
            <a [routerLink]="['/facturas', f.facturaId]">{{ f.numero }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Cliente</th>
          <td mat-cell *matCellDef="let f">{{ f.razonSocial }}</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Monto</th>
          <td mat-cell *matCellDef="let f">{{ f.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="saldo"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Saldo</th>
          <td mat-cell *matCellDef="let f">{{ f.saldo | bob }}</td></ng-container
        >
        <ng-container matColumnDef="vence"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Vence</th>
          <td mat-cell *matCellDef="let f">{{ f.venceEl | fecha }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let f">
            <!-- Vencida: chip propio en tono error (no «Por cobrar» en info); un pago parcial lo sigue diciendo. -->
            @if (f.vencida) {
              <cc-estado grupo="Vigencia" valor="VENCIDO" [texto]="textoVencida(f.diasVencida)" />
            }
            @if (!f.vencida || f.estado !== 'EMITIDA') {
              <cc-estado grupo="EstadoFactura" [valor]="f.estado" />
            }</td
        ></ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let f; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista
      [control]="lista"
      nombre="facturas"
      [vacio]="saldo() === 'todas' ? 'No hay facturas.' : 'No hay facturas con saldo.'"
      [error]="error()"
      [cargando]="cargando()"
    />
  `,
})
export class FacturasPagina {
  private readonly fachada = inject(FacturasFachada);
  readonly facturas = this.fachada.facturas;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly campos = { facturas: 'Finanzas' };
  readonly columnas = ['numero', 'cliente', 'monto', 'saldo', 'vence', 'estado'];
  readonly lista = controlLista({
    filas: this.facturas,
    texto: (f) => `${f.numero} ${f.razonSocial}`,
    estado: (f) => f.estado,
    orden: {
      numero: (f) => f.numero,
      cliente: (f) => f.razonSocial,
      monto: (f) => aCentavos(f.monto),
      saldo: (f) => aCentavos(f.saldo),
      vence: (f) => f.venceEl,
      estado: (f) => posicionEstado('EstadoFactura', f.estado),
    },
    ordenInicial: { orden: 'vence', dir: 'asc' },
  });
  /** "Con saldo" (por defecto) o "todas": lo filtra Finanzas y vive en la URL como los demás filtros. */
  readonly saldo = this.lista.parametro('saldo');
  readonly estadosConSaldo = ESTADOS_CON_SALDO;
  readonly cambioDeSaldo = cambioDeSaldo;
  readonly textoVencida = textoVencida;

  constructor() {
    effect(() => this.fachada.conSaldo.set(this.saldo() === 'todas' ? null : true));
  }
}
