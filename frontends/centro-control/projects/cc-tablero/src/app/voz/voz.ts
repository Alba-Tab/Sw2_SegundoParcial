import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { codigoDe, mensajeDe, nuevaClave, TablaReporte, type Resultado } from 'ui-comun';
import { ExportarReporteGQL, PreguntarGQL, ReporteGQL, type PreguntarMutation, type ReporteId } from '../graphql/generado';
import { Grabadora } from './grabadora';

type Respuesta = PreguntarMutation['preguntar'];

/**
 * CU-16 (spec 015): mantener pulsado para hablar (15 s), Whisper tiny transcribe en un Web Worker sin salir del
 * navegador, el texto se corrige y se envía. Analítica decide el reporte en código; aquí se muestra el texto, la tabla,
 * el gráfico y "Exportar". Si el LLM no está (FR4) o la pregunta no es del catálogo, quedan los botones del catálogo.
 */
@Component({
  selector: 'app-voz',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    TablaReporte,
  ],
  template: `
    <h1>Pregunta por voz</h1>
    <div class="fila-acciones">
      <button
        mat-fab
        extended
        (pointerdown)="hablar()"
        (pointerup)="soltar()"
        (pointerleave)="grabando() && soltar()"
        [disabled]="transcribiendo() || enviando()"
        [attr.aria-pressed]="grabando()"
      >
        <mat-icon>{{ grabando() ? 'mic' : 'mic_none' }}</mat-icon>
        {{ grabando() ? 'Escuchando… suelta para terminar' : 'Mantén pulsado para hablar' }}
      </button>
      @if (transcribiendo()) {
        <span class="secundario">Transcribiendo en el navegador…</span>
      }
    </div>
    <mat-form-field class="pregunta">
      <mat-label>Tu pregunta (puedes corregirla antes de enviar)</mat-label>
      <input matInput [(ngModel)]="texto" (keyup.enter)="enviar()" maxlength="300" />
    </mat-form-field>
    <button mat-flat-button (click)="enviar()" [disabled]="texto.trim().length < 3 || enviando()">Preguntar</button>
    @if (enviando()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (error()) {
      <p class="no-disponible">{{ error() }}</p>
    }
    @if (catalogo()) {
      <p class="secundario">Puedo responder sobre estos 5 reportes:</p>
      <div class="fila-acciones">
        @for (r of reportes; track r.id) {
          <button mat-stroked-button (click)="correr(r.id, {})">{{ r.titulo }}</button>
        }
      </div>
    }
    @if (respuesta(); as r) {
      <mat-card class="respuesta">
        <mat-card-content>
          <p class="texto">{{ r.texto }}</p>
          @for (o of r.opciones ?? []; track o.etiqueta) {
            <button mat-stroked-button (click)="correr(o.reporteId, o.parametros)">{{ o.etiqueta }}</button>
          }
        </mat-card-content>
      </mat-card>
    }
    @if (resultado(); as res) {
      <div class="fila-acciones">
        <h2>{{ res.titulo }}</h2>
        <button mat-stroked-button (click)="exportar()"><mat-icon>download</mat-icon> Exportar a Excel</button>
      </div>
      <cc-tabla-reporte [resultado]="res" />
    }
  `,
  styles: `
    .pregunta {
      width: 100%;
      max-width: 720px;
      display: block;
    }
    .respuesta {
      margin: 16px 0;
    }
    .texto {
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class VozPagina implements OnDestroy {
  private readonly preguntarGql = inject(PreguntarGQL);
  private readonly reporteGql = inject(ReporteGQL);
  private readonly exportarGql = inject(ExportarReporteGQL);
  private readonly grabadora = new Grabadora();
  private readonly trabajador = new Worker(new URL('./whisper.worker', import.meta.url), { type: 'module' });
  readonly grabando = signal(false);
  readonly transcribiendo = signal(false);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly catalogo = signal(false);
  readonly respuesta = signal<Respuesta | null>(null);
  readonly resultado = signal<Resultado | null>(null);
  private ultimo: { id: ReporteId; params: Record<string, unknown> } | null = null;
  texto = '';
  readonly reportes: { id: ReporteId; titulo: string }[] = [
    { id: 'CUENTAS_POR_COBRAR', titulo: 'Cuentas por cobrar' },
    { id: 'VIAJES_EN_RIESGO', titulo: 'Viajes en riesgo' },
    { id: 'FACTURACION_POR_CLIENTE', titulo: 'Facturación por cliente' },
    { id: 'CONSUMO_COMBUSTIBLE', titulo: 'Consumo de combustible' },
    { id: 'RENTABILIDAD', titulo: 'Rentabilidad' },
  ];

  constructor() {
    this.trabajador.onmessage = ({ data }: MessageEvent<{ texto?: string; error?: string }>) => {
      this.transcribiendo.set(false);
      if (data.error) this.error.set('No se pudo transcribir; escribe la pregunta');
      else this.texto = data.texto ?? '';
    };
  }

  ngOnDestroy(): void {
    this.trabajador.terminate();
  }

  async hablar(): Promise<void> {
    this.error.set(null);
    try {
      await this.grabadora.empezar(() => void this.soltar());
      this.grabando.set(true);
    } catch {
      this.error.set('Sin permiso de micrófono: escribe la pregunta');
    }
  }

  async soltar(): Promise<void> {
    if (!this.grabando()) return;
    this.grabando.set(false);
    this.transcribiendo.set(true);
    const audio = await this.grabadora.terminar();
    this.trabajador.postMessage({ audio }, [audio.buffer]);
  }

  async enviar(): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);
    this.catalogo.set(false);
    this.respuesta.set(null);
    this.resultado.set(null);
    try {
      const r = await firstValueFrom(this.preguntarGql.mutate({ variables: { texto: this.texto.trim() } }));
      const p = r.data?.preguntar ?? null;
      this.respuesta.set(p);
      if (p?.resultado && p.reporteId) {
        this.resultado.set(p.resultado as Resultado);
        this.ultimo = { id: p.reporteId, params: p.parametros ?? {} };
      }
    } catch (e) {
      const codigo = codigoDe(e);
      this.error.set(
        codigo === 'LLM_NO_DISPONIBLE'
          ? 'El asistente no está disponible'
          : codigo === 'PREGUNTA_FUERA_DE_ALCANCE'
            ? 'Puedo responder sobre estos 5 reportes'
            : codigo === 'SIN_PERMISO'
              ? 'No tienes permiso para ese reporte'
              : mensajeDe(e),
      );
      this.catalogo.set(codigo === 'LLM_NO_DISPONIBLE' || codigo === 'PREGUNTA_FUERA_DE_ALCANCE');
    } finally {
      this.enviando.set(false);
    }
  }

  /** Botones de aclaración y del catálogo: `reporte(id, params)` sin pasar por el LLM ni el MCP (spec 015). */
  async correr(id: ReporteId, params: Record<string, unknown>): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);
    try {
      const r = await firstValueFrom(this.reporteGql.fetch({ variables: { id, params } }));
      if (r.error) throw r.error;
      this.resultado.set((r.data?.reporte as Resultado | undefined) ?? null);
      this.ultimo = { id, params };
    } catch (e) {
      this.error.set(mensajeDe(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async exportar(): Promise<void> {
    if (!this.ultimo) return;
    try {
      const r = await firstValueFrom(
        this.exportarGql.mutate({ variables: { id: this.ultimo.id, params: this.ultimo.params, clave: nuevaClave() } }),
      );
      if (r.data?.exportarReporte.url) window.location.assign(r.data.exportarReporte.url);
    } catch (e) {
      this.error.set(mensajeDe(e));
    }
  }
}
