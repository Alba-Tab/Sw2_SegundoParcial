import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { cargandoDe, completo, conservarUltimoBueno, Intentos, PaginasCursor } from 'ui-comun';
import type { LineasCreditoQuery } from '../graphql/generado';
import { LineasRepositorio } from './data/lineas.repositorio';
import { conLinea } from './domain/linea';

/** La línea de crédito de cada cliente sale de Finanzas: si cae, se conserva la última leída (FB-1). */
const LINEA_POR_CLIENTE = { 'clientes.items': { clave: 'clienteId', campos: ['lineaCredito'] } };

/**
 * Fachada de las líneas de crédito: la primera página de clientes cada 60 s, las siguientes con «Cargar más» (E5-1),
 * y su gestión (G6, spec 012).
 */
@Injectable()
export class LineasFachada {
  private readonly repo = inject(LineasRepositorio);
  /** Una clave por intento: reintentar tras un corte con los mismos datos no aplica dos veces el cambio. */
  private readonly intentos = new Intentos();
  private readonly consulta = this.repo.observar(60_000);
  private readonly datos = toSignal(this.consulta.valueChanges.pipe(conservarUltimoBueno(undefined, LINEA_POR_CLIENTE)));
  readonly paginas = new PaginasCursor(
    () => completo<LineasCreditoQuery>(this.datos())?.clientes,
    async (despuesDe) => {
      const r = await firstValueFrom(this.repo.pagina(despuesDe));
      return { pagina: completo<LineasCreditoQuery>(r)?.clientes, error: r.error };
    },
    (c) => c.clienteId,
  );
  readonly lineas = computed(() => conLinea(this.paginas.items()));
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
  /** Clientes cuya línea no se pudo leer: no salen en la lista, y se dice (D-1). */
  readonly incompletas = computed(() => {
    // De todas las páginas cargadas (E2-2). Las que se repusieron con la última línea leída (FB-1) sí salen: no se cuentan.
    const ids = this.paginas.idsConError('clientes.items', 'lineaCredito', this.datos()?.error);
    return this.paginas.items().filter((c) => ids.has(c.clienteId) && !c.lineaCredito).length;
  });

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

  /** `refetch` del mismo `watch`: al resolver, la primera página ya trae el cambio (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta.refetch();
  }
}
