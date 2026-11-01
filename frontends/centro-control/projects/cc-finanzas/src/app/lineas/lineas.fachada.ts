import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { cargandoDe, completo, filasConError } from 'ui-comun';
import type { LineasCreditoQuery } from '../graphql/generado';
import { LineasRepositorio } from './data/lineas.repositorio';
import { conLinea } from './domain/linea';

/** Fachada de las líneas de crédito, cada 60 s. */
@Injectable()
export class LineasFachada {
  private readonly datos = toSignal(inject(LineasRepositorio).observar(60_000));
  readonly lineas = computed(() => conLinea(completo<LineasCreditoQuery>(this.datos())?.clientes ?? []));
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
  /** Clientes cuya línea no se pudo leer: no salen en la lista, y se dice (D-1). */
  readonly incompletas = computed(() => {
    const clientes = completo<LineasCreditoQuery>(this.datos())?.clientes ?? [];
    // Las que se repusieron con la última línea leída (FB-1) sí salen en la lista: no se cuentan.
    return [...filasConError(this.datos()?.error, 'clientes', 'lineaCredito')].filter((i) => !clientes[i]?.lineaCredito).length;
  });
  /** `clientes` trae como máximo 100 (LIMITE_MAXIMO del Gateway, sin cursor): se dice si llegó al tope (D-2). */
  readonly clientesLeidos = computed(() => completo<LineasCreditoQuery>(this.datos())?.clientes?.length ?? 0);
}
