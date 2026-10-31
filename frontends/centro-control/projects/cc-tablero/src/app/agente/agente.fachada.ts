import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo, Intentos } from 'ui-comun';
import type { MisionesQuery } from '../graphql/generado';
import { AgenteRepositorio } from './data/agente.repositorio';

/** Fachada del panel del agente: las misiones cada 5 s y el disparo manual. */
@Injectable()
export class AgenteFachada {
  private readonly repo = inject(AgenteRepositorio);
  private readonly intentos = new Intentos();
  private readonly datos = toSignal(this.repo.observarMisiones(5_000));
  readonly misiones = computed(() => completo<MisionesQuery>(this.datos())?.misionesAgente ?? []);
  readonly error = computed(() => this.datos()?.error);

  disparar() {
    return this.intentos.enviar('dispararMision', {}, (clave) => this.repo.disparar(clave));
  }
}
