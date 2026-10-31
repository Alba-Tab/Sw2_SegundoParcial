import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AvisoServicios, codigoDe, CONFIG_CENTRO, FechaPipe, mensajeDe, Sesion } from 'ui-comun';
import { AgenteFachada } from '../agente.fachada';
import { mensajeDisparo, urlTraza } from '../domain/mision';

/**
 * Panel del agente (spec 014): cada misión con sus pasos (herramienta, argumentos, resumen y ms). El gerente y el
 * despachador la disparan a mano; las acciones propuestas se deciden en cc-operaciones.
 */
@Component({
  selector: 'app-agente',
  providers: [AgenteFachada],
  imports: [MatButtonModule, MatExpansionModule, FechaPipe, AvisoServicios],
  template: `
    <div class="fila-acciones">
      <h1>Agente "vigilar viajes"</h1>
      <button mat-flat-button (click)="disparar()" [disabled]="enviando()">Disparar misión</button>
      <a mat-button [href]="config.urls['cc-operaciones'] + '/acciones'">Ver acciones propuestas →</a>
    </div>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!misiones().length" />
    <mat-accordion>
      @for (m of misiones(); track m.misionId) {
        <mat-expansion-panel [expanded]="mision() ? m.misionId === mision() : $first" [class.elegida]="m.misionId === mision()">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <span class="chip-estado" [attr.data-alerta]="m.estado === 'FALLIDA' || m.estado === 'SALTADA'">{{ m.estado }}</span>
              &nbsp;{{ m.iniciadaEn | fecha: true }} · {{ m.origen }}
            </mat-panel-title>
            <mat-panel-description>
              {{ m.pasos.length }} pasos · {{ m.accionesCreadas ?? 0 }} acciones {{ m.codigo ? '· ' + m.codigo : '' }}
            </mat-panel-description>
          </mat-expansion-panel-header>
          @for (p of m.pasos; track p.numero) {
            <div class="paso" [class.error]="p.error">
              <b>{{ p.numero }}. {{ p.herramienta }}</b> <span class="secundario">({{ p.ms }} ms)</span>
              <code>{{ json(p.argumentos) }}</code>
              <span class="secundario">{{ p.resumen }}</span>
            </div>
          }
          @if (m.conclusion) {
            <p class="secundario">Conclusión: {{ m.conclusion }}</p>
          }
          @if (m.traceId) {
            <p class="secundario">
              Traza:
              @if (urlTraza(m.traceId); as url) {
                <a [href]="url" target="_blank" rel="noopener">{{ m.traceId }} en Jaeger</a>
              } @else {
                {{ m.traceId }}
              }
            </p>
          }
        </mat-expansion-panel>
      } @empty {
        <p class="secundario">Todavía no corrió ninguna misión.</p>
      }
    </mat-accordion>
  `,
  styles: `
    .paso {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .elegida {
      outline: 2px solid var(--mat-sys-primary);
    }
    .paso.error b {
      color: var(--mat-sys-error);
    }
    code {
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
    }
  `,
})
export class AgentePagina {
  private readonly fachada = inject(AgenteFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
  /** `?mision=<id>`: el enlace de una acción en cc-operaciones abre esa misión. */
  readonly mision = input<string>();
  readonly misiones = this.fachada.misiones;
  readonly error = this.fachada.error;
  readonly campos = { misionesAgente: 'Analítica' };
  readonly enviando = signal(false);
  readonly json = (v: unknown) => JSON.stringify(v);

  urlTraza(traceId: string): string | null {
    return urlTraza(this.config.jaegerUrl, traceId);
  }

  async disparar(): Promise<void> {
    this.enviando.set(true);
    try {
      await this.fachada.disparar();
      this.avisos.open('Misión disparada: los pasos aparecen aquí', undefined, { duration: 4000 });
    } catch (e) {
      this.avisos.open(mensajeDisparo(codigoDe(e), mensajeDe(e)), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
