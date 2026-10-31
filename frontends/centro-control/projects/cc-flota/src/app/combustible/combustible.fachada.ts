import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo, fechaLaPaz } from 'ui-comun';
import type { CombustibleQuery } from '../graphql/generado';
import { CombustibleRepositorio } from './data/combustible.repositorio';
import { DIAS_ANOMALIAS } from './domain/combustible';

/** Fachada de combustible: anomalías de los últimos 30 días y últimas cargas, cada 30 s. */
@Injectable()
export class CombustibleFachada {
  private readonly datos = toSignal(inject(CombustibleRepositorio).observar(fechaLaPaz(-DIAS_ANOMALIAS), 30_000));
  readonly anomalias = computed(() => completo<CombustibleQuery>(this.datos())?.anomaliasCombustible ?? []);
  readonly cargas = computed(() => completo<CombustibleQuery>(this.datos())?.cargasCombustible ?? []);
  readonly error = computed(() => this.datos()?.error);
}
