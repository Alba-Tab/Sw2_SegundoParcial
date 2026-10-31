import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { completo } from 'ui-comun';
import type { ConduccionQuery } from '../graphql/generado';
import { ConduccionRepositorio } from './data/conduccion.repositorio';

/** Fachada del puntaje de conducción de la semana, cada 60 s. */
@Injectable()
export class ConduccionFachada {
  private readonly datos = toSignal(inject(ConduccionRepositorio).observar(60_000));
  readonly puntajes = computed(() => completo<ConduccionQuery>(this.datos())?.puntajesConduccion);
  readonly error = computed(() => this.datos()?.error);
}
