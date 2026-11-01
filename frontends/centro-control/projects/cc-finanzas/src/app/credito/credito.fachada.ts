import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { cargandoDe, completo, conservarUltimoBueno, Intentos } from 'ui-comun';
import type { SolicitudesQuery } from '../graphql/generado';
import { CreditoRepositorio } from './data/credito.repositorio';

/** Fachada de la aprobación de crédito: solicitudes cada 15 s y la decisión de administración. */
@Injectable()
export class CreditoFachada {
  private readonly repo = inject(CreditoRepositorio);
  private readonly intentos = new Intentos();
  private readonly consulta = this.repo.observarSolicitudes(15_000);
  private readonly datos = toSignal(this.consulta.valueChanges.pipe(conservarUltimoBueno()));
  readonly solicitudes = computed(() => completo<SolicitudesQuery>(this.datos())?.solicitudesAprobacion ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));

  decidir(servicioId: string, aprobado: boolean, motivo: string | undefined) {
    return this.intentos.enviar(`aprobarCredito:${servicioId}`, { aprobado, motivo }, (clave) =>
      this.repo.decidir(servicioId, aprobado, motivo, clave),
    );
  }

  /** `refetch` del mismo `watch`: al resolver, `solicitudes()` ya trae la respuesta nueva (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta.refetch();
  }
}
