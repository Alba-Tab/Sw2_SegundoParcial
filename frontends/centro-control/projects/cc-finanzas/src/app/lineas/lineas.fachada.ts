import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { cargandoDe, completo } from 'ui-comun';
import type { LineasCreditoQuery } from '../graphql/generado';
import { LineasRepositorio } from './data/lineas.repositorio';
import { conLinea } from './domain/linea';

/** Fachada de las líneas de crédito, cada 60 s. */
@Injectable()
export class LineasFachada {
  private readonly datos = toSignal(inject(LineasRepositorio).observar(60_000));
  readonly lineas = computed(() => conLinea(completo<LineasCreditoQuery>(this.datos())?.clientes ?? []));
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => cargandoDe(this.datos()));
}
