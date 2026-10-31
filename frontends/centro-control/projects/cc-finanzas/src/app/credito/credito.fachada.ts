import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { completo, Intentos } from 'ui-comun';
import type { SolicitudesQuery } from '../graphql/generado';
import { CreditoRepositorio } from './data/credito.repositorio';

/** Fachada de la aprobación de crédito: solicitudes cada 15 s y la decisión de administración. */
@Injectable()
export class CreditoFachada {
  private readonly repo = inject(CreditoRepositorio);
  private readonly intentos = new Intentos();
  private readonly datos = toSignal(this.repo.observarSolicitudes(15_000));
  readonly solicitudes = computed(() => completo<SolicitudesQuery>(this.datos())?.solicitudesAprobacion ?? []);
  readonly error = computed(() => this.datos()?.error);

  decidir(servicioId: string, aprobado: boolean, motivo: string | undefined) {
    return this.intentos.enviar(`aprobarCredito:${servicioId}`, { aprobado, motivo }, (clave) =>
      this.repo.decidir(servicioId, aprobado, motivo, clave),
    );
  }

  recargar(): Promise<unknown> {
    return firstValueFrom(this.repo.recargarSolicitudes());
  }
}
