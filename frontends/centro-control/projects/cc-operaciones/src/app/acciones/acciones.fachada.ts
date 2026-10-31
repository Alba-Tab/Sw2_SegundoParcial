import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { completo, Intentos } from 'ui-comun';
import type { AccionesQuery } from '../graphql/generado';
import { AccionesRepositorio } from './data/acciones.repositorio';

/** Fachada de las acciones del agente, cada 15 s, y la decisión del despachador (CU-18). */
@Injectable()
export class AccionesFachada {
  private readonly repo = inject(AccionesRepositorio);
  private readonly intentos = new Intentos();
  readonly datos = toSignal(this.repo.observar(15_000));
  readonly acciones = computed(() => completo<AccionesQuery>(this.datos())?.accionesPropuestas ?? []);
  readonly error = computed(() => this.datos()?.error);

  aprobar(id: string, mensaje: string) {
    return this.intentos.enviar(`aprobarAccion:${id}`, { mensaje }, (clave) => this.repo.aprobar(id, mensaje, clave));
  }

  rechazar(id: string, motivo: string | undefined) {
    return this.intentos.enviar(`rechazarAccion:${id}`, { motivo }, (clave) => this.repo.rechazar(id, motivo, clave));
  }

  recargar(): Promise<unknown> {
    return firstValueFrom(this.repo.recargar());
  }
}
