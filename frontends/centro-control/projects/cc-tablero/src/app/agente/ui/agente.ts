import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Encabezado,
  AvisoServicios,
  codigoDe,
  CONFIG_CENTRO,
  Estado,
  EtiquetaPipe,
  FechaPipe,
  mensajeDe,
  Sesion,
  Esqueleto,
  urlEnApp,
} from 'ui-comun';
import { AgenteFachada } from '../agente.fachada';
import { conclusionLegible, mensajeDisparo, pasoLegible, urlTraza } from '../domain/mision';

/**
 * Panel del agente (spec 014): cada misión con sus pasos (herramienta, argumentos, resumen y ms). El gerente y el
 * despachador la disparan a mano; las acciones propuestas se deciden en cc-operaciones.
 */
@Component({
  selector: 'app-agente',
  providers: [AgenteFachada],
  imports: [Esqueleto, Encabezado, MatButtonModule, MatExpansionModule, MatIconModule, FechaPipe, EtiquetaPipe, Estado, AvisoServicios],
  template: `
    <cc-encabezado titulo="Agente «vigilar viajes»">
      <button mat-flat-button (click)="disparar()" [disabled]="enviando()" disabledInteractive>Disparar misión</button>
      @if (urlAcciones; as url) {
        <a mat-button [href]="url">Ver acciones propuestas</a>
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!misiones().length" />
    <mat-accordion>
      @for (m of misiones(); track m.misionId) {
        <mat-expansion-panel [expanded]="mision() ? m.misionId === mision() : $first" [class.elegida]="m.misionId === mision()">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <cc-estado grupo="EstadoMision" [valor]="m.estado" />
              &nbsp;{{ m.iniciadaEn | fecha: true }} · {{ m.origen | etiqueta: 'OrigenMision' }}
            </mat-panel-title>
            <mat-panel-description>
              {{ m.pasos.length }} pasos · {{ m.accionesCreadas ?? 0 }} acciones
              {{ m.codigo ? '· ' + (m.codigo | etiqueta: 'MotivoMision') : '' }}
            </mat-panel-description>
          </mat-expansion-panel-header>
          <!-- JV-3: lo que hizo el agente en frases; el JSON, los nombres de herramienta y la traza van detrás de «Ver detalle técnico». -->
          <ol class="pasos">
            @for (p of m.pasos; track p.numero) {
              <li>
                {{ pasoLegible(p.herramienta) }}
                @if (p.error) {
                  <span class="fallo"><mat-icon>error</mat-icon>No respondió</span>
                }
              </li>
            }
          </ol>
          @if (conclusionLegible(m.conclusion, m.estado); as c) {
            <p>{{ c }}</p>
          }
          <details class="tecnico">
            <summary>Ver detalle técnico</summary>
            @for (p of m.pasos; track p.numero) {
              <div class="paso">
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
          </details>
        </mat-expansion-panel>
      } @empty {
        @if (!cargando()) {
          <p class="secundario">Todavía no corrió ninguna misión.</p>
        }
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
    .pasos {
      margin: 0 0 8px;
      padding-left: 24px;
    }
    .pasos li {
      padding: 4px 0;
    }
    .fallo {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      color: var(--mat-sys-error);
    }
    .fallo mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .tecnico summary {
      cursor: pointer;
      min-height: 44px;
      display: flex;
      align-items: center;
      color: var(--mat-sys-primary);
    }
    code {
      font: var(--mat-sys-body-small);
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
  /** Con `?desde=` para que Acciones ofrezca volver aquí (R2F-10). */
  readonly urlAcciones = urlEnApp(this.config, this.sesion.roles(), 'cc-operaciones', '/acciones');
  /** `?mision=<id>`: el enlace de una acción en cc-operaciones abre esa misión. */
  readonly mision = input<string>();
  readonly misiones = this.fachada.misiones;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly campos = { misionesAgente: 'Analítica' };
  readonly enviando = signal(false);
  readonly json = (v: unknown) => JSON.stringify(v);
  readonly pasoLegible = pasoLegible;
  readonly conclusionLegible = conclusionLegible;

  urlTraza(traceId: string): string | null {
    return urlTraza(this.config.jaegerUrl, traceId);
  }

  async disparar(): Promise<void> {
    // disabledInteractive: el botón enfocado sigue enfocable mientras se envía; un segundo clic no hace nada.
    if (this.enviando()) return;
    this.enviando.set(true);
    try {
      await this.fachada.disparar();
      this.avisos.open('Misión disparada: los pasos aparecen aquí', undefined, { duration: 4000 });
    } catch (e) {
      this.avisos.open(mensajeDisparo(codigoDe(e), mensajeDe(e)), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}
