import { Component, effect, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  AvisoServicios,
  BobPipe,
  CONFIG_CENTRO,
  Encabezado,
  Esqueleto,
  Estado,
  estadoLineaCredito,
  EtiquetaPipe,
  FechaPipe,
  LIMITE_GATEWAY,
  Sesion,
} from 'ui-comun';
import { ClienteFachada } from '../clientes.fachada';
import { nombreRuta } from '../domain/cliente';

/** Ficha de un cliente (G7): datos, línea de crédito y sus últimos servicios con enlace al viaje. */
@Component({
  selector: 'app-cliente',
  providers: [ClienteFachada],
  imports: [
    Esqueleto,
    Encabezado,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    BobPipe,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
  ],
  template: `
    @let titulo = cliente()?.razonSocial ?? 'Cliente';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Clientes', ruta: '/clientes' }, { texto: titulo }]">
      @if (sesion.tiene('comercial') && cliente(); as c) {
        <a
          mat-button
          [href]="config.urls['portal-cliente'] + '/servicios?clienteId=' + encodeURIComponent(c.clienteId)"
          target="_blank"
          rel="noopener noreferrer"
          ><mat-icon>open_in_new</mat-icon>Ver como cliente <span class="cdk-visually-hidden">(se abre en otra pestaña)</span></a
        >
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios buscado="este cliente" [error]="error()" [campos]="campos" [sinDatos]="!cliente()" />
    @if (cliente(); as c) {
      <dl class="datos">
        <div>
          <dt>NIT</dt>
          <dd>{{ c.nit ?? 'Sin dato' }}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{{ c.correo ?? 'Sin dato' }}</dd>
        </div>
        <div>
          <dt>Canal</dt>
          <dd>{{ c.canal | etiqueta: 'CanalCotizacion' }}</dd>
        </div>
      </dl>

      @if (verCredito) {
        <h2>Línea de crédito</h2>
        @if (linea(); as l) {
          <dl class="datos">
            <div>
              <dt>Estado</dt>
              <dd><cc-estado grupo="EstadoLineaCredito" [valor]="estadoLinea(l)" /></dd>
            </div>
            <div>
              <dt>Límite</dt>
              <dd>{{ l.limite | bob }}</dd>
            </div>
            <div>
              <dt>Reservado</dt>
              <dd>{{ l.reservado | bob }}</dd>
            </div>
            <div>
              <dt>Utilizado</dt>
              <dd>{{ l.utilizado | bob }}</dd>
            </div>
            <div>
              <dt>Disponible</dt>
              <dd>{{ l.disponible | bob }}</dd>
            </div>
          </dl>
        } @else if (!error()) {
          <p class="secundario">El cliente no tiene línea de crédito.</p>
        }
      }

      <h2>Servicios</h2>
      @if (servicios().length) {
        <div class="tabla-ancha" role="region" tabindex="0" aria-label="Servicios del cliente">
          <table mat-table [dataSource]="servicios()">
            <ng-container matColumnDef="fecha"
              ><th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let s">
                @if (s.viajeId) {
                  <a [routerLink]="['/viajes', s.viajeId]">{{ s.fechaViaje | fecha }}</a>
                } @else {
                  {{ s.fechaViaje | fecha }}
                }
              </td></ng-container
            >
            <ng-container matColumnDef="estado"
              ><th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let s"><cc-estado grupo="EstadoServicio" [valor]="s.estado" /></td
            ></ng-container>
            <ng-container matColumnDef="carga"
              ><th mat-header-cell *matHeaderCellDef>Ruta y carga</th>
              <td mat-cell *matCellDef="let s">
                {{ ruta(s.rutaId) }} <span class="secundario">{{ s.tipoCarga | etiqueta: 'TipoCarga' }} · {{ s.toneladas }} t</span>
              </td></ng-container
            >
            <ng-container matColumnDef="placa"
              ><th mat-header-cell *matHeaderCellDef>Unidad</th>
              <td mat-cell *matCellDef="let s">{{ s.placa ?? 'Sin dato' }}</td></ng-container
            >
            <ng-container matColumnDef="monto"
              ><th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let s">{{ s.monto | bob }}</td></ng-container
            >
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let s; columns: columnas"></tr>
          </table>
        </div>
        @if (servicios().length >= limiteServicios) {
          <p class="secundario">Se muestran los últimos {{ limiteServicios }}.</p>
        }
      } @else if (!error()) {
        <p class="secundario">El cliente aún no tiene servicios.</p>
      }
    } @else if (cargado() || !idValido()) {
      <p class="secundario">
        @if (listaTruncada()) {
          Ese cliente no está entre los primeros {{ limiteClientes }} que lee el Centro de Control.
        } @else {
          No se encontró ese cliente.
        }
        Vuelve a la <a routerLink="/clientes">lista de clientes</a>.
      </p>
    }
  `,
})
export class ClientePagina {
  private readonly fachada = inject(ClienteFachada);
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
  readonly id = input.required<string>();
  readonly cliente = this.fachada.cliente;
  readonly linea = this.fachada.lineaCredito;
  readonly servicios = this.fachada.servicios;
  readonly cargado = this.fachada.cargado;
  readonly idValido = this.fachada.idValido;
  readonly listaTruncada = this.fachada.listaTruncada;
  readonly limiteClientes = LIMITE_GATEWAY;
  readonly limiteServicios = 50;
  readonly encodeURIComponent = encodeURIComponent;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly verCredito = this.fachada.verCredito;
  readonly campos = { clientes: 'Viajes', servicios: 'Viajes', rutas: 'Viajes', lineaCredito: 'Finanzas' };
  readonly columnas = ['fecha', 'estado', 'carga', 'placa', ...(this.fachada.verMonto ? ['monto'] : [])];
  readonly estadoLinea = estadoLineaCredito;

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  ruta(rutaId: string | null | undefined): string {
    return nombreRuta(this.fachada.rutas(), rutaId);
  }
}
