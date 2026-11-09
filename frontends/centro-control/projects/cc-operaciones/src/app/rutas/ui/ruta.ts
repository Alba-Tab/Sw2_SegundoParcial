import { afterNextRender, Component, effect, inject, Injector, input, signal, viewChild } from '@angular/core';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AvisoServicios, Encabezado, enfocarTitulo, Esqueleto, mensajeDe, NumeroPipe, Sesion } from 'ui-comun';
import { AVISO_ACTIVAR_SIN_TARIFA, ROLES_GESTION_RUTAS, textoActiva, type ValoresRuta } from '../domain/ruta';
import { RutaFachada } from '../rutas.fachada';
import { RutaFormulario } from './ruta-formulario';

/** Ficha de una ruta (G4, B1): sus datos por id; gerente y despachador la editan, también para activarla o no. */
@Component({
  selector: 'app-ruta',
  providers: [RutaFachada],
  imports: [Esqueleto, Encabezado, NumeroPipe, AvisoServicios, MatButtonModule, RutaFormulario],
  template: `
    @let titulo = ruta()?.nombre ?? 'Ruta';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Rutas', ruta: '/rutas' }, { texto: titulo }]">
      @if (gestiona && ruta()) {
        <button
          mat-stroked-button
          #botonEditar
          (click)="editando() ? cerrar() : editando.set(true)"
          [attr.aria-expanded]="editando()"
          aria-controls="editar-ruta"
        >
          Editar
        </button>
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios
      buscado="esta ruta"
      [error]="error()"
      [campos]="campos"
      [sinDatos]="!ruta()"
      [sinResultado]="!idValido()"
      [reintentar]="recargar"
    />
    @if (ruta(); as r) {
      @if (editando()) {
        <app-ruta-formulario
          id="editar-ruta"
          titulo="Editar ruta"
          accion="Guardar cambios"
          [inicial]="r"
          [enviando]="enviando()"
          (guardar)="guardar(r.rutaId, $event)"
          (cancelar)="cerrar()"
        />
      }
      @if (r.activa === false) {
        <p class="secundario" role="status">Inactiva: no se cotiza ni se programa. {{ avisoActivar }}</p>
      } @else if (gestiona) {
        <p class="secundario">Activa: si Finanzas no tiene su tarifa para una carga, el portal no puede cotizarla.</p>
      }
      <dl class="datos">
        <div>
          <dt>Estado</dt>
          <dd>{{ textoActiva(r) }}</dd>
        </div>
        <div>
          <dt>Origen</dt>
          <dd>{{ r.origen }}</dd>
        </div>
        <div>
          <dt>Destino</dt>
          <dd>{{ r.destino }}</dd>
        </div>
        <div>
          <dt>Distancia</dt>
          <dd>{{ r.distanciaKm | numero: 1 }} km</dd>
        </div>
        <div>
          <dt>Radio de la geocerca</dt>
          <dd>{{ r.radioMetros !== null && r.radioMetros !== undefined ? (r.radioMetros | numero) + ' m' : 'Sin dato' }}</dd>
        </div>
      </dl>
    }
  `,
})
export class RutaPagina {
  private readonly fachada = inject(RutaFachada);
  private readonly avisos = inject(MatSnackBar);
  private readonly injector = inject(Injector);
  private readonly botonEditar = viewChild<MatButton>('botonEditar');
  readonly id = input.required<string>();
  readonly gestiona = inject(Sesion).tiene(...ROLES_GESTION_RUTAS);
  readonly ruta = this.fachada.ruta;
  readonly idValido = this.fachada.idValido;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { ruta: 'Viajes' };
  readonly textoActiva = textoActiva;
  readonly avisoActivar = AVISO_ACTIVAR_SIN_TARIFA;
  readonly editando = signal(false);
  readonly enviando = signal(false);
  readonly recargar = () => this.fachada.recargar();

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  /** Cierra el formulario y devuelve el foco a «Editar» (o al título). */
  cerrar(): void {
    this.editando.set(false);
    afterNextRender(() => (this.botonEditar() ? this.botonEditar()!.focus() : enfocarTitulo()), { injector: this.injector });
  }

  async guardar(rutaId: string, valores: ValoresRuta): Promise<void> {
    this.enviando.set(true);
    try {
      await this.fachada.editar(rutaId, valores);
      this.avisos.open('Ruta actualizada', undefined, { duration: 4000 });
      this.cerrar();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}
