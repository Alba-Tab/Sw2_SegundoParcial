import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { cargandoDe, completo, conservarUltimoBueno, filasConError, Intentos } from 'ui-comun';
import type { LineasCreditoQuery } from '../graphql/generado';
import { LineasRepositorio } from './data/lineas.repositorio';
import { conLinea } from './domain/linea';

/** La línea de crédito de cada cliente sale de Finanzas: si cae, se conserva la última leída (FB-1). */
const LINEA_POR_CLIENTE = { clientes: { clave: 'clienteId', campos: ['lineaCredito'] } };

/** Fachada de las líneas de crédito, cada 60 s, y de su gestión (G6, spec 012). */
@Injectable()
export class LineasFachada {
  private readonly repo = inject(LineasRepositorio);
  /** Una clave por intento: reintentar tras un corte con los mismos datos no aplica dos veces el cambio. */
  private readonly intentos = new Intentos();
  private readonly consulta = this.repo.observar(60_000);
  private readonly datos = toSignal(this.consulta.valueChanges.pipe(conservarUltimoBueno(undefined, LINEA_POR_CLIENTE)));
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

  ajustar(clienteId: string, limite: string, motivo: string) {
    return this.intentos.enviar(`ajustarLineaCredito:${clienteId}`, { limite, motivo }, (clave) =>
      this.repo.ajustar(clienteId, limite, motivo, clave),
    );
  }

  cambiarEstado(clienteId: string, suspendida: boolean, motivo: string) {
    return this.intentos.enviar(`cambiarEstadoLineaCredito:${clienteId}`, { suspendida, motivo }, (clave) =>
      this.repo.cambiarEstado(clienteId, suspendida, motivo, clave),
    );
  }

  /** `refetch` del mismo `watch`: al resolver, `lineas()` ya trae el cambio (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta.refetch();
  }
}
