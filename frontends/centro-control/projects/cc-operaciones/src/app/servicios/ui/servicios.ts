import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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
  Campo,
  CONFIG_CENTRO,
  controlLista,
  Encabezado,
  enfocar,
  enfocarTitulo,
  Estado,
  etiqueta,
  EtiquetaPipe,
  exigirTexto,
  FechaPipe,
  FiltrosLista,
  mensajeDe,
  PieLista,
  posicionEstado,
  Sesion,
  textoError,
} from 'ui-comun';
import { estadoServicio, puedeCancelarServicio, type Servicio } from '../domain/servicio';
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
    ReactiveFormsModule,
    Campo,
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
    <cc-aviso-servicios
      [error]="error()"
      [datosAl]="datosAl()"
      [campos]="campos"
      [sinDatos]="!servicios().length"
      [reintentar]="recargar"
    />
    <cc-filtros-lista
      [control]="lista"
      [cargando]="cargando()"
      busqueda="Buscar por cliente, placa o chofer"
      grupo="EstadoServicio"
      nombre="servicios"
      singular="servicio"
      [limite]="80"
      corte="recientes"
      [estadoEnServidor]="true"
    />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Servicios">
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
                <!-- Cancelar devuelve el crédito y la unidad: se pide el motivo de esta fila y se confirma con un resumen. -->
                <div class="confirmacion" role="group" aria-label="Cancelar el servicio" #zona>
                  <p class="resumen" [id]="'resumen-' + s.servicioId">{{ resumen(s) }}</p>
                  <mat-form-field class="motivo">
                    <mat-label>Motivo</mat-label>
                    <input
                      matInput
                      [formControl]="motivo"
                      [id]="'motivo-' + s.servicioId"
                      [attr.aria-describedby]="'resumen-' + s.servicioId"
                    />
                    <mat-hint>De 3 a 300 caracteres</mat-hint>
                    <mat-error>{{ textoError(motivo) }}</mat-error>
                  </mat-form-field>
                  <!-- disabledInteractive: el botón enfocado no pierde el foco al deshabilitarse; el clic se ignora. -->
                  <button mat-flat-button (click)="cancelar(s.servicioId, zona)" [disabled]="enviando()" disabledInteractive>
                    <mat-icon>cancel</mat-icon>Sí, cancelar el servicio
                  </button>
                  <button mat-button (click)="enviando() || cerrar(s.servicioId)" [disabled]="enviando()" disabledInteractive>
                    No, volver
                  </button>
                </div>
              } @else {
                <button mat-button [id]="'cancelar-' + s.servicioId" (click)="abrir(s.servicioId)" [disabled]="enviando()">
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
    <cc-pie-lista
      [control]="lista"
      nombre="servicios"
      [vacio]="lista.filtro().estado === 'CONFIRMADO' ? 'No hay servicios confirmados.' : 'No hay servicios.'"
      [error]="error()"
      [cargando]="cargando()"
    />
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
    .resumen {
      flex-basis: 100%;
      margin: 0;
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
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
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
      estado: (s) => posicionEstado('EstadoServicio', s.estado),
      carga: (s) => etiqueta('TipoCarga', s.tipoCarga).texto,
      fecha: (s) => s.fechaViaje,
      unidad: (s) => s.placa,
      monto: (s) => aCentavos(s.monto ?? ''),
    },
    ordenInicial: { orden: 'fecha', dir: 'desc' },
    // Quien cancela entra a lo que pide acción: los confirmados (spec 004, D-4). "Todos" sigue en el filtro.
    estadoInicial: this.sesion.tiene('despachador', 'comercial') ? 'CONFIRMADO' : undefined,
  });
  readonly enviando = signal(false);
  /** La fila que está pidiendo confirmación; el motivo se escribe de nuevo para cada una. */
  readonly confirmando = signal<string | null>(null);
  readonly motivo = new FormControl('', { nonNullable: true });
  readonly textoError = textoError;
  readonly puedeCancelarServicio = puedeCancelarServicio;
  private readonly bob = new BobPipe();
  private readonly fecha = new FechaPipe();
  readonly recargar = () => this.fachada.recargar();

  constructor() {
    // El filtro de estado de la URL también se pide a Viajes: el límite de 80 filas se aplica ya filtrado.
    effect(() => this.fachada.estado.set(estadoServicio(this.lista.filtro().estado)));
  }

  nombre(clienteId: string): string {
    return this.fachada.nombreCliente(clienteId);
  }

  resumen(s: Servicio): string {
    const monto = this.fachada.verMonto && s.monto ? ` y se devuelven ${this.bob.transform(s.monto)} a su línea de crédito` : '';
    return `Se cancela el servicio de ${this.nombre(s.clienteId ?? '')} del ${this.fecha.transform(s.fechaViaje)}: se libera la unidad ${s.placa ?? ''}${monto}. No se puede deshacer.`;
  }

  /** Abre la confirmación de la fila con el foco en el motivo; al cerrarla, el foco vuelve a "Cancelar…". */
  abrir(servicioId: string): void {
    this.motivo.reset();
    this.confirmando.set(servicioId);
    enfocar(`motivo-${servicioId}`);
  }

  cerrar(servicioId: string): void {
    this.confirmando.set(null);
    enfocar(`cancelar-${servicioId}`);
  }

  async cancelar(servicioId: string, zona: HTMLElement): Promise<void> {
    if (this.enviando() || !exigirTexto(this.motivo, 3, 300, zona)) return;
    this.enviando.set(true);
    // El motivo no cambia mientras se envía, como en las otras confirmaciones (E-4, V2-13).
    this.motivo.disable();
    try {
      await this.fachada.cancelar(servicioId, this.motivo.getRawValue().trim());
      this.avisos.open('Servicio cancelado: se devolvieron el crédito y la unidad', undefined, { duration: 5000 });
      this.confirmando.set(null);
      await this.fachada.recargar();
      // El servicio cancelado ya no tiene "Cancelar…": el foco va al título de la página.
      enfocarTitulo();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar');
      // Como en las otras confirmaciones: el foco vuelve a lo que hay que corregir, el motivo.
      enfocar(`motivo-${servicioId}`);
    } finally {
      this.motivo.enable();
      this.enviando.set(false);
    }
  }
}
