import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AvisoServicios, codigoDe, completo, CONFIG_CENTRO, FechaPipe, Intentos, mensajeDe, Sesion } from 'ui-comun';
import { DispararMisionGQL, MisionesGQL, type MisionesQuery } from '../graphql/generado';

/**
 * Panel del agente (spec 014): cada misión con sus pasos (herramienta, argumentos, resumen y ms). El gerente y el
 * despachador la disparan a mano; las acciones propuestas se deciden en cc-operaciones.
 */
@Component({
  selector: 'app-agente',
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
        <mat-expansion-panel [expanded]="$first">
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
            <p class="secundario">Traza: {{ m.traceId }}</p>
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
  private readonly gql = inject(MisionesGQL);
  private readonly dispararGql = inject(DispararMisionGQL);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
  private readonly datos = toSignal(this.gql.watch({ pollInterval: 5_000 }).valueChanges);
  readonly misiones = computed(() => completo<MisionesQuery>(this.datos())?.misionesAgente ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly campos = { misionesAgente: 'Analítica' };
  readonly enviando = signal(false);
  private readonly intentos = new Intentos();
  readonly json = (v: unknown) => JSON.stringify(v);

  async disparar(): Promise<void> {
    this.enviando.set(true);
    try {
      await this.intentos.enviar('dispararMision', {}, (clave) => this.dispararGql.mutate({ variables: { clave } }));
      this.avisos.open('Misión disparada: los pasos aparecen aquí', undefined, { duration: 4000 });
    } catch (e) {
      const codigo = codigoDe(e);
      this.avisos.open(
        codigo === 'LLM_NO_DISPONIBLE'
          ? 'El asistente no está disponible (misión saltada)'
          : codigo === 'CONFLICTO_ESTADO'
            ? 'Ya hay una misión en curso'
            : mensajeDe(e),
        'Cerrar',
        { duration: 6000 },
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
