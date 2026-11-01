import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import {
  aCentavos,
  AvisoServicios,
  BobPipe,
  CONFIG_CENTRO,
  controlLista,
  Encabezado,
  Estado,
  etiqueta,
  EtiquetaPipe,
  FechaPipe,
  FiltrosLista,
  mensajeDe,
  PieLista,
  Sesion,
} from 'ui-comun';
import { estadoServicio, motivoCancelacionValido, puedeCancelarServicio } from '../domain/servicio';
import { ServiciosFachada } from '../servicios.fachada';

/**
 * Servicios (spec 004), filtrables por estado: el despachador y atención comercial cancelan; comercial abre el portal "como el
 * cliente" por SSO (propuesta 7.7).
 */
@Component({
  selector: 'app-servicios',
  providers: [ServiciosFachada],
  imports: [
    Encabezado,
    FormsModule,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    BobPipe,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado titulo="Servicios" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!servicios().length" />
    <cc-filtros-lista
      [control]="lista"
      busqueda="Buscar por cliente, placa o chofer"
      grupo="EstadoServicio"
      nombre="servicios"
      singular="servicio"
    />
    <div class="tabla-ancha">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Cliente</th>
          <td mat-cell *matCellDef="let s">{{ nombre(s.clienteId) }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let s"><cc-estado grupo="EstadoServicio" [valor]="s.estado" /></td
        ></ng-container>
        <ng-container matColumnDef="carga"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Carga</th>
          <td mat-cell *matCellDef="let s">{{ s.tipoCarga | etiqueta: 'TipoCarga' }} · {{ s.toneladas }} t</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Fecha</th>
          <td mat-cell *matCellDef="let s">{{ s.fechaViaje | fecha }}</td></ng-container
        >
        <ng-container matColumnDef="unidad"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Unidad</th>
          <td mat-cell *matCellDef="let s">{{ s.placa }} · {{ s.choferNombre }}</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Monto</th>
          <td mat-cell *matCellDef="let s">{{ s.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="acciones">
          <th mat-header-cell *matHeaderCellDef><span class="cdk-visually-hidden">Acciones</span></th>
          <td mat-cell *matCellDef="let s">
            @if (puedeCancelar() && puedeCancelarServicio(s)) {
              @if (confirmando() === s.servicioId) {
                <!-- Cancelar devuelve el crédito y la unidad: se pide el motivo de esta fila y una confirmación. -->
                <div class="confirmacion">
                  <mat-form-field class="motivo"
                    ><mat-label>Motivo (3 a 300)</mat-label
                    ><input matInput [(ngModel)]="motivos[s.servicioId]" minlength="3" maxlength="300" required
                  /></mat-form-field>
                  <button mat-flat-button (click)="cancelar(s.servicioId)" [disabled]="!motivoValido(s.servicioId) || enviando()">
                    <mat-icon>cancel</mat-icon>Sí, cancelar el servicio
                  </button>
                  <button mat-button (click)="confirmando.set(null)" [disabled]="enviando()">No</button>
                </div>
              } @else {
                <button mat-button (click)="confirmando.set(s.servicioId)" [disabled]="enviando()">
                  <mat-icon>cancel</mat-icon>Cancelar…
                </button>
              }
            }
            @if (sesion.tiene('comercial')) {
              <a mat-button [href]="config.urls['portal-cliente'] + '/servicios?clienteId=' + s.clienteId" target="_blank" rel="noopener"
                ><mat-icon>open_in_new</mat-icon>Ver como cliente <span class="cdk-visually-hidden">(se abre en otra pestaña)</span></a
              >
            }
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas()"></tr>
        <tr mat-row *matRowDef="let s; columns: columnas()"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="servicios" vacio="No hay servicios." [error]="error()" />
  `,
  styles: `
    .confirmacion {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding: 4px 0;
    }
    .motivo {
      min-width: 240px;
    }
  `,
})
export class ServiciosPagina {
  private readonly fachada = inject(ServiciosFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
  readonly servicios = this.fachada.servicios;
  readonly error = this.fachada.error;
  readonly campos = { servicios: 'Viajes', clientes: 'Viajes' };
  readonly puedeCancelar = computed(() => this.sesion.tiene('despachador', 'comercial'));
  /** La columna del monto, solo si el rol lo ve (no se le pide al despachador). */
  readonly columnas = computed(() =>
    this.fachada.verMonto
      ? ['cliente', 'estado', 'carga', 'fecha', 'unidad', 'monto', 'acciones']
      : ['cliente', 'estado', 'carga', 'fecha', 'unidad', 'acciones'],
  );
  readonly lista = controlLista({
    filas: this.servicios,
    texto: (s) => [this.nombre(s.clienteId ?? ''), s.placa, s.choferNombre, etiqueta('TipoCarga', s.tipoCarga).texto].join(' '),
    estado: (s) => s.estado,
    orden: {
      cliente: (s) => this.nombre(s.clienteId ?? ''),
      estado: (s) => etiqueta('EstadoServicio', s.estado).texto,
      carga: (s) => etiqueta('TipoCarga', s.tipoCarga).texto,
      fecha: (s) => s.fechaViaje,
      unidad: (s) => s.placa,
      monto: (s) => aCentavos(s.monto ?? ''),
    },
    ordenInicial: { orden: 'fecha', dir: 'asc' },
  });
  readonly enviando = signal(false);
  /** La fila que está pidiendo confirmación; cada fila tiene su propio motivo. */
  readonly confirmando = signal<string | null>(null);
  motivos: Record<string, string> = {};
  readonly puedeCancelarServicio = puedeCancelarServicio;

  constructor() {
    // El filtro de estado de la URL también se pide a Viajes: el límite de 80 filas se aplica ya filtrado.
    effect(() => this.fachada.estado.set(estadoServicio(this.lista.filtro().estado)));
  }

  nombre(clienteId: string): string {
    return this.fachada.nombreCliente(clienteId);
  }

  motivoValido(servicioId: string): boolean {
    return motivoCancelacionValido(this.motivos[servicioId]);
  }

  async cancelar(servicioId: string): Promise<void> {
    if (!this.motivoValido(servicioId)) return;
    this.enviando.set(true);
    try {
      const motivo = this.motivos[servicioId].trim();
      await this.fachada.cancelar(servicioId, motivo);
      this.avisos.open('Servicio cancelado: se devolvieron el crédito y la unidad', undefined, { duration: 5000 });
      delete this.motivos[servicioId];
      this.confirmando.set(null);
      await this.fachada.recargar();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
