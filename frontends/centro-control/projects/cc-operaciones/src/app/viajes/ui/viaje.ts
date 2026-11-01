import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AvisoServicios,
  BobPipe,
  Campo,
  CONFIG_CENTRO,
  cargandoDe,
  erroresGraphql,
  Confirmacion,
  Encabezado,
  Esqueleto,
  Estado,
  EtiquetaPipe,
  FechaPipe,
  enfocar,
  enfocarTitulo,
  exigirTexto,
  largoEntre,
  mensajeDe,
  NumeroPipe,
  pct,
  Sesion,
  textoError,
  urlEnApp,
} from 'ui-comun';
import { RouterLink } from '@angular/router';
import { colaDeOrigen } from '../domain/viaje';
import { ViajeFachada } from '../viajes.fachada';

/** Detalle del viaje (al que llevan las alertas): bitácora, entrega, riesgo y las decisiones del despachador. */
@Component({
  selector: 'app-viaje',
  providers: [ViajeFachada],
  imports: [
    Encabezado,
    ReactiveFormsModule,
    Campo,
    Confirmacion,
    Esqueleto,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    RouterLink,
    BobPipe,
    FechaPipe,
    NumeroPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
  ],
  template: `
    @let r = datos();
    @let placa = r?.data?.viaje?.placa;
    @let titulo = placa ? 'Viaje ' + placa : 'Viaje';
    <cc-encabezado [titulo]="titulo" [migas]="[origen(), { texto: titulo }]">
      @if (r?.data?.viaje; as v) {
        <cc-estado grupo="EstadoViaje" [valor]="v.estado" />
      }
      @if (r?.data?.viaje?.estado === 'EN_RUTA') {
        <a mat-stroked-button routerLink="/viajes/mapa" [queryParams]="{ viaje: id() }"><mat-icon>map</mat-icon>Ver en el mapa</a>
      }
    </cc-encabezado>
    @if (cargandoDe(r)) {
      <cc-esqueleto [filas]="6" />
    }
    <!-- El Gateway ya convierte el 404 de la predicción en null (W3): un error en riesgo lo dice su sección (B-1, V1-10). -->
    <cc-aviso-servicios
      buscado="este viaje"
      [error]="r?.error"
      [datosAl]="r?.datosAl"
      [campos]="campos"
      [sinDatos]="!r?.data?.viaje"
      [reintentar]="recargar"
    />
    @if (r?.data?.viaje; as v) {
      <!-- Lo que pide una decisión va primero (PRODUCT.md, principio 1). -->
      @if (sesion.tiene('despachador') && v.estado === 'ENTREGA_OBSERVADA') {
        <section class="decision" aria-labelledby="titulo-decision">
          <h2 id="titulo-decision">Decidir la entrega observada</h2>
          <div class="fila-acciones" #zonaEntrega>
            <mat-form-field class="ancho">
              <mat-label>Nota o motivo</mat-label>
              <input matInput [formControl]="texto" />
              <mat-hint>Opcional al aprobar; para rechazar, obligatorio. De 3 a 300 caracteres</mat-hint>
              <mat-error>{{ textoError(texto) }}</mat-error>
            </mat-form-field>
            @if (!confirmando()) {
              <button mat-flat-button (click)="aprobar(id(), zonaEntrega)" [disabled]="enviando()" disabledInteractive>
                <mat-icon>thumb_up</mat-icon>Aprobar entrega
              </button>
              <button mat-stroked-button id="pedir-rechazo" (click)="pedirRechazo(zonaEntrega)" [disabled]="enviando()">
                <mat-icon>block</mat-icon>Rechazar (no se factura)
              </button>
            }
          </div>
          @if (confirmando() === 'rechazo') {
            <cc-confirmacion
              [resumen]="
                'Se rechaza la entrega del viaje' +
                (v.placa ? ' ' + v.placa : '') +
                ' con el motivo «' +
                texto.value.trim() +
                '»: no se factura al cliente. No se puede deshacer.'
              "
              accion="Sí, rechazar la entrega"
              icono="block"
              [enviando]="enviando()"
              (confirmar)="rechazar(id(), zonaEntrega)"
              (volver)="volver()"
            />
          }
        </section>
      }
      @if (sesion.tiene('despachador') && v.estado === 'REQUIERE_INTERVENCION') {
        <section class="decision" aria-labelledby="titulo-intervencion">
          <h2 id="titulo-intervencion">Resolver la intervención</h2>
          <!-- R2F-5: v.motivo es el código de cancelación (viajes.yaml), no la causa; la causa es esta. -->
          <p>La cancelación automática no terminó: quedó una reserva o el crédito sin liberar.</p>
          <div class="fila-acciones" #zonaIntervencion>
            <mat-form-field class="ancho">
              <mat-label>Nota</mat-label>
              <input matInput [formControl]="texto" />
              <mat-hint>Para marcar resuelto, obligatoria (3 a 500 caracteres); para reintentar, opcional</mat-hint>
              <mat-error>{{ textoError(texto) }}</mat-error>
            </mat-form-field>
            @if (!confirmando()) {
              <button mat-flat-button (click)="reintentar(id(), zonaIntervencion)" [disabled]="enviando()" disabledInteractive>
                <mat-icon>replay</mat-icon>Reintentar la liberación
              </button>
              <button mat-stroked-button id="pedir-resolucion" (click)="pedirResolucion(zonaIntervencion)" [disabled]="enviando()">
                <mat-icon>task_alt</mat-icon>Marcar resuelto
              </button>
            }
          </div>
          @if (confirmando() === 'resolucion') {
            <!-- Spec 011, paso 6: marcar resuelto cancela el viaje (RESUELTO_MANUALMENTE); no se deshace (R2F-2). -->
            <cc-confirmacion
              [resumen]="
                'Se marca resuelto el viaje' +
                (v.placa ? ' ' + v.placa : '') +
                ' con la nota «' +
                texto.value.trim() +
                '»: el viaje queda cancelado y las reservas se liberan solas cuando vuelva su servicio. No se puede deshacer.'
              "
              accion="Sí, marcar resuelto"
              icono="task_alt"
              [enviando]="enviando()"
              (confirmar)="marcarResuelto(id(), zonaIntervencion)"
              (volver)="volver()"
            />
          }
        </section>
      }

      @if (!sesion.tiene('despachador') && (v.estado === 'ENTREGA_OBSERVADA' || v.estado === 'REQUIERE_INTERVENCION')) {
        <!-- R2F-3: la decisión pendiente que este rol no toma dice quién la toma (specs 007 y 011). -->
        <p class="secundario">
          <mat-icon class="icono-en-linea">lock_person</mat-icon
          >{{
            v.estado === 'ENTREGA_OBSERVADA'
              ? 'La entrega observada la decide el despachador.'
              : 'La intervención la resuelve el despachador.'
          }}
        </p>
      }

      <dl class="datos">
        <div>
          <dt>Cliente</dt>
          <dd>
            @if (v.cliente; as c) {
              <a [routerLink]="['/clientes', c.clienteId]">{{ c.razonSocial }}</a>
            } @else {
              Sin dato
            }
          </dd>
        </div>
        <div>
          <dt>Ruta</dt>
          <dd>
            @if (v.ruta; as r) {
              <a [routerLink]="['/rutas', r.rutaId]">{{ r.nombre }}</a>
              @if (r.distanciaKm) {
                ({{ r.distanciaKm | numero }} km)
              }
            } @else {
              Sin dato
            }
          </dd>
        </div>
        <div>
          <dt>Carga</dt>
          <dd>{{ v.tipoCarga | etiqueta: 'TipoCarga' }} · {{ v.toneladas | numero }} t</dd>
        </div>
        <div>
          <dt>Fecha del viaje</dt>
          <dd>{{ v.fechaViaje | fecha }}</dd>
        </div>
        <div>
          <dt>Chofer</dt>
          <dd>
            <!-- Como la unidad: a la ficha del chofer en Flota, si el rol abre Flota. -->
            @if (v.choferNombre && urlChofer(v.choferId); as url) {
              <a [href]="url">{{ v.choferNombre }}</a>
            } @else {
              {{ v.choferNombre ?? 'Sin dato' }}
            }
          </dd>
        </div>
        <div>
          <dt>Unidad</dt>
          <dd>
            <!-- FL-1: a la ficha de la unidad en Flota, si el rol abre Flota. -->
            @if (v.unidad && urlUnidad(v.unidad.unidadId); as url) {
              <a [href]="url">{{ v.unidad.placa }}</a>
            } @else {
              {{ v.unidad?.placa ?? v.placa ?? 'Sin unidad' }}
            }
            @if (v.unidad?.estado; as estadoUnidad) {
              <cc-estado grupo="EstadoUnidad" [valor]="estadoUnidad" />
            }
          </dd>
        </div>
        @if (verMonto) {
          <div>
            <dt>Monto</dt>
            <dd>{{ v.monto | bob }}</dd>
          </div>
        }
        <div>
          <dt>Iniciado</dt>
          <dd>{{ v.iniciadoEn | fecha: true }}</dd>
        </div>
        <div>
          <dt>Última posición</dt>
          <dd>{{ v.ultimaPosicionEn | fecha: true }}</dd>
        </div>
      </dl>

      @if (v.riesgo; as riesgo) {
        <h2>Riesgo de retraso: {{ pct(riesgo.probabilidad) }}</h2>
        <dl class="datos">
          @for (f of riesgo.factores; track f.nombre) {
            <div>
              <dt>{{ f.nombre }}</dt>
              <dd>+{{ pct(f.aporte) }}</dd>
            </div>
          }
        </dl>
        <p class="secundario">Calculado {{ riesgo.calculadaEn | fecha: true }} · umbral {{ pct(riesgo.umbral) }}</p>
      } @else if (verRiesgo && v.estado === 'EN_RUTA') {
        <h2>Riesgo de retraso</h2>
        @if (errorRiesgo()) {
          <p class="secundario">Riesgo no disponible. Reintenta en unos minutos.</p>
        } @else {
          <p class="secundario">Aún no hay datos para estimar el retraso.</p>
        }
      }

      @if (v.entrega; as e) {
        <h2>{{ e.tipo | etiqueta: 'TipoEntrega' }}</h2>
        <dl class="datos">
          <div>
            <dt>Registrada</dt>
            <dd>{{ e.registradaEn | fecha: true }}</dd>
          </div>
          <div>
            <dt>Geocerca</dt>
            <dd>{{ e.dentroGeocerca ? 'Dentro' : 'Fuera' }} ({{ e.distanciaMetros | numero: 0 }} m del destino)</dd>
          </div>
          <div>
            <dt>Firma</dt>
            <dd>{{ e.conFirma ? 'Con firma de ' + e.nombreReceptor : 'Sin firma' }}</dd>
          </div>
          @if (e.razones?.length) {
            <div>
              <dt>Razones</dt>
              <dd>
                @for (razon of e.razones; track razon) {
                  {{ razon | etiqueta: 'RazonObservacion' }}{{ $last ? '' : ', ' }}
                }
              </dd>
            </div>
          }
          @if (e.motivo) {
            <div class="completo">
              <dt>Motivo</dt>
              <dd>{{ e.motivo }}</dd>
            </div>
          }
        </dl>
      }

      <h2>Bitácora</h2>
      @for (h of v.hitos ?? []; track h.hitoId) {
        <p class="hito">
          <cc-estado grupo="TipoHito" [valor]="h.tipo" /> {{ h.registradoEn | fecha: true }} · {{ h.descripcion }}
          @if (h.origen) {
            <span class="secundario">({{ h.origen | etiqueta: 'OrigenHito' }})</span>
          }
        </p>
      } @empty {
        <p class="secundario">Sin hitos.</p>
      }
    } @else if (r && !r.loading && !r.error) {
      <p class="no-disponible">El viaje no existe</p>
    }
  `,
  styles: `
    .ancho {
      min-width: min(320px, 100%);
    }
    .decision {
      margin-bottom: 24px;
    }
    .decision h2 {
      margin-top: 0;
    }
    .hito {
      margin: 6px 0;
    }
  `,
})
export class ViajePagina {
  private readonly fachada = inject(ViajeFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  private readonly config = inject(CONFIG_CENTRO);
  urlUnidad(unidadId: string | null | undefined): string | null {
    if (!unidadId) return null;
    return urlEnApp(this.config, this.sesion.roles(), 'cc-flota', `/unidades/${encodeURIComponent(unidadId)}`);
  }
  urlChofer(choferId: string | null | undefined): string | null {
    if (!choferId) return null;
    return urlEnApp(this.config, this.sesion.roles(), 'cc-flota', `/choferes/${encodeURIComponent(choferId)}`);
  }
  readonly id = input.required<string>();
  /** La cola desde la que se abrió (`?de=`), validada contra una lista cerrada: miga y "volver" llevan ahí (V1-5). */
  readonly de = input<string>();
  readonly origen = computed(() => colaDeOrigen(this.de()));
  readonly datos = this.fachada.datos;
  readonly verMonto = this.fachada.verMonto;
  readonly verRiesgo = this.fachada.verRiesgo;
  /** La predicción vino con error (no es el 404 de "sin datos", que el Gateway ya deja en null). */
  readonly errorRiesgo = computed(() => erroresGraphql(this.datos()?.error).some((e) => e.path?.includes('riesgo')));
  readonly enviando = signal(false);
  readonly pct = pct;
  readonly campos = { viaje: 'Viajes', unidad: { servicio: 'Flota', que: 'los datos de la unidad' }, riesgo: '' };
  readonly cargandoDe = cargandoDe;
  readonly textoError = textoError;
  /**
   * Rechazar la entrega y marcar resuelta la intervención no se deshacen: se confirman con un resumen (R2F-2). Aprobar
   * la entrega no se confirma, igual que las demás aprobaciones: es el desenlace esperado de la revisión.
   */
  readonly confirmando = signal<'rechazo' | 'resolucion' | null>(null);
  readonly texto = new FormControl('', { nonNullable: true, validators: [largoEntre(0, 500)] });
  readonly recargar = () => this.fachada.recargar();

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  /**
   * La nota es opcional para aprobar o reintentar y obligatoria para rechazar o marcar resuelto; si viene, de 3 a 300
   * caracteres, o hasta 500 para marcar resuelto (specs 007 y 011, revisión E-12).
   */
  private valida(obligatoria: boolean, zona: HTMLElement, max = 300): boolean {
    return exigirTexto(this.texto, 3, max, zona, obligatoria);
  }

  aprobar(viajeId: string, zona: HTMLElement) {
    // Mientras se envía, un segundo clic no vuelve a validar ni mueve el foco (V6-4).
    if (this.enviando() || !this.valida(false, zona)) return;
    const nota = this.texto.value.trim() || undefined;
    return this.enviar(() => this.fachada.aprobarEntrega(viajeId, nota), 'Entrega aprobada: se factura');
  }
  /** Con el texto válido, pide confirmar con el campo bloqueado: no se puede borrar después (E-4). */
  pedirRechazo(zona: HTMLElement): void {
    this.pedir('rechazo', zona);
  }
  pedirResolucion(zona: HTMLElement): void {
    this.pedir('resolucion', zona);
  }
  private pedir(tipo: 'rechazo' | 'resolucion', zona: HTMLElement): void {
    if (!this.valida(true, zona, tipo === 'resolucion' ? 500 : 300)) return;
    this.texto.disable();
    this.confirmando.set(tipo);
  }
  /** "No, volver" o un envío fallido: el campo se desbloquea y el foco vuelve al botón que pidió confirmar (E-3). */
  volver(): void {
    const tipo = this.confirmando();
    this.texto.enable();
    this.confirmando.set(null);
    enfocar(tipo === 'resolucion' ? 'pedir-resolucion' : 'pedir-rechazo');
  }
  /** El texto confirmado, revalidado con el campo habilitado; si ya no vale, vuelve al formulario. */
  private confirmado(zona: HTMLElement, max: number): string | null {
    this.texto.enable();
    if (!this.valida(true, zona, max)) {
      this.volver();
      return null;
    }
    this.texto.disable();
    return this.texto.value.trim();
  }
  rechazar(viajeId: string, zona: HTMLElement) {
    const motivo = this.confirmado(zona, 300);
    if (motivo === null) return;
    return this.enviar(() => this.fachada.rechazarEntrega(viajeId, motivo), 'Entrega rechazada');
  }
  reintentar(viajeId: string, zona: HTMLElement) {
    if (this.enviando() || !this.valida(false, zona)) return;
    const nota = this.texto.value.trim() || undefined;
    return this.enviar(() => this.fachada.resolverIntervencion(viajeId, 'REINTENTAR_COMPENSACION', nota), 'Intervención enviada');
  }
  marcarResuelto(viajeId: string, zona: HTMLElement) {
    const nota = this.confirmado(zona, 500);
    if (nota === null) return;
    return this.enviar(() => this.fachada.resolverIntervencion(viajeId, 'MARCAR_RESUELTO', nota), 'Viaje marcado resuelto');
  }

  private async enviar(accion: () => Promise<unknown>, ok: string): Promise<void> {
    // disabledInteractive: el botón enfocado sigue enfocable mientras se envía; un segundo clic no hace nada.
    if (this.enviando()) return;
    this.enviando.set(true);
    try {
      await accion();
      this.texto.enable();
      this.texto.reset();
      this.confirmando.set(null);
      this.avisos.open(ok, undefined, { duration: 4000 });
      await this.fachada.recargar();
      // La decisión cambia el estado y su sección desaparece con el botón: el foco va al título del viaje (E-3).
      enfocarTitulo();
    } catch (e) {
      if (this.confirmando()) this.volver();
      this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}
