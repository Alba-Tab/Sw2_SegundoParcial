import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { cargandoDe, completo, conservarUltimoBueno, Intentos } from 'ui-comun';
import type { AccionesQuery } from '../graphql/generado';
import { AccionesRepositorio } from './data/acciones.repositorio';

/** Fachada de las acciones del agente, cada 15 s, y la decisión del despachador (CU-18). */
@Injectable()
export class AccionesFachada {
  private readonly repo = inject(AccionesRepositorio);
  private readonly intentos = new Intentos();
  private readonly consulta = this.repo.observar(15_000);
  readonly datos = toSignal(this.consulta.valueChanges.pipe(conservarUltimoBueno()));
  readonly acciones = computed(() => completo<AccionesQuery>(this.datos())?.accionesPropuestas ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));

  aprobar(id: string, mensaje: string) {
    return this.intentos.enviar(`aprobarAccion:${id}`, { mensaje }, (clave) => this.repo.aprobar(id, mensaje, clave));
  }

  rechazar(id: string, motivo: string | undefined) {
    return this.intentos.enviar(`rechazarAccion:${id}`, { motivo }, (clave) => this.repo.rechazar(id, motivo, clave));
  }

  /** `refetch` del mismo `watch`: al resolver, `acciones()` ya trae la respuesta nueva (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta.refetch();
  }
}
