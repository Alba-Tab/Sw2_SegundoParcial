import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  aCentavos,
  AvisoServicios,
  BobPipe,
  columnasConEstado,
  CONFIG_CENTRO,
  controlLista,
  Encabezado,
  Estado,
  estadoLineaCredito,
  etiqueta,
  EtiquetaPipe,
  FiltrosLista,
  mensajeDe,
  PieLista,
  posicionEstado,
  Sesion,
  urlEnApp,
} from 'ui-comun';
import { ClientesFachada } from '../clientes.fachada';
import { textoCliente, type FilaCliente } from '../domain/cliente';

/** G7: clientes con su línea de crédito (solo a quien la puede ver). La ficha lleva a sus servicios. */
@Component({
  selector: 'app-clientes',
  providers: [ClientesFachada],
  imports: [
    Encabezado,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    RouterLink,
    BobPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado titulo="Clientes">
      <!-- FL-2: el crédito se administra en Finanzas; aquí solo se resume. -->
      @if (verCredito && urlLineas; as url) {
        <a mat-button [href]="url"><mat-icon>open_in_new</mat-icon>Líneas de crédito en Finanzas</a>
      }
    </cc-encabezado>
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!clientes().length" />
    @if (verCredito) {
      <cc-filtros-lista
        [control]="lista"
        [cargando]="cargando()"
        busqueda="Buscar por razón social, NIT o correo"
        grupo="EstadoLineaCredito"
        nombre="clientes"
        singular="cliente"
      />
    } @else {
      <cc-filtros-lista
        [control]="lista"
        [cargando]="cargando()"
        busqueda="Buscar por razón social, NIT o correo"
        nombre="clientes"
        singular="cliente"
      />
    }
    @if (sinLeerCredito().size; as n) {
      <p class="aviso-lista" role="status">
        <mat-icon>cloud_off</mat-icon>No se pudo leer la línea de crédito de {{ n }} {{ n === 1 ? 'cliente' : 'clientes' }}.
      </p>
    }
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Clientes">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="razonSocial"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Razón social</th>
          <td mat-cell *matCellDef="let c">
            <a [routerLink]="['/clientes', c.clienteId]">{{ c.razonSocial }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="nit"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>NIT</th>
          <td mat-cell *matCellDef="let c">{{ c.nit ?? 'Sin dato' }}</td></ng-container
        >
        <ng-container matColumnDef="correo"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Correo</th>
          <td mat-cell *matCellDef="let c">{{ c.correo ?? 'Sin dato' }}</td></ng-container
        >
        <ng-container matColumnDef="canal"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Canal</th>
          <td mat-cell *matCellDef="let c">{{ c.canal | etiqueta: 'CanalCotizacion' }}</td></ng-container
        >
        <ng-container matColumnDef="disponible"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Crédito disponible</th>
          <td mat-cell *matCellDef="let c">
            @if (c.lineaCredito; as l) {
              {{ l.disponible | bob }} <span class="secundario">de {{ l.limite | bob }}</span>
            } @else if (sinLeerCredito().has(c.clienteId)) {
              <span class="secundario">No se pudo leer</span>
            } @else {
              <span class="secundario">Sin línea</span>
            }
          </td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Crédito</th>
          <td mat-cell *matCellDef="let c">
            @if (c.lineaCredito; as l) {
              <cc-estado grupo="EstadoLineaCredito" [valor]="estadoLinea(l)" />
            }</td
        ></ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas()"></tr>
        <tr mat-row *matRowDef="let c; columns: columnas()"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="clientes" vacio="No hay clientes registrados." [error]="error()" [cargando]="cargando()" />
    @if (paginas.siguienteCursor()) {
      <!-- E5-1: la búsqueda y el orden usan solo los clientes ya cargados. -->
      <p class="secundario">Se muestran los primeros {{ clientes().length }} clientes; la búsqueda y el orden solo usan esos.</p>
      <button mat-stroked-button (click)="cargarMas()" [disabled]="paginas.cargandoMas()" disabledInteractive>Cargar más clientes</button>
    }
  `,
})
export class ClientesPagina {
  private readonly fachada = inject(ClientesFachada);
  readonly clientes = this.fachada.clientes;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly verCredito = this.fachada.verCredito;
  readonly sinLeerCredito = this.fachada.sinLeerCredito;
  readonly paginas = this.fachada.paginas;
  private readonly avisos = inject(MatSnackBar);
  readonly campos = { clientes: 'Viajes', lineaCredito: 'Finanzas' };
  readonly columnas = columnasConEstado(['razonSocial', 'nit', 'correo', 'canal', ...(this.verCredito ? ['disponible', 'estado'] : [])]);
  readonly estadoLinea = estadoLineaCredito;
  readonly urlLineas = urlEnApp(inject(CONFIG_CENTRO), inject(Sesion).roles(), 'cc-finanzas', '/lineas-credito');
  async cargarMas(): Promise<void> {
    try {
      await this.paginas.cargarMas();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar');
    }
  }

  readonly lista = controlLista<FilaCliente>({
    filas: this.clientes,
    texto: textoCliente,
    estado: (c) => (c.lineaCredito ? estadoLineaCredito(c.lineaCredito) : null),
    orden: {
      razonSocial: (c) => c.razonSocial,
      nit: (c) => c.nit,
      correo: (c) => c.correo,
      canal: (c) => etiqueta('CanalCotizacion', c.canal).texto,
      disponible: (c) => (c.lineaCredito ? aCentavos(c.lineaCredito.disponible) : null),
      estado: (c) => (c.lineaCredito ? posicionEstado('EstadoLineaCredito', estadoLineaCredito(c.lineaCredito)) : null),
    },
    ordenInicial: { orden: 'razonSocial', dir: 'asc' },
  });
}
