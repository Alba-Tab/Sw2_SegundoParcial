import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { completo, Intentos, type Resultado } from 'ui-comun';
import type { CatalogoQuery, ReporteId } from '../graphql/generado';
import { ReportesRepositorio } from './data/reportes.repositorio';

/**
 * Consultar y exportar un reporte (spec 015), compartido por la página de reportes y la de voz: `reporte(id, params)`
 * va directo a Analítica sin LLM ni MCP; "Exportar a Excel" pide un enlace HMAC (D21) con una clave por intento.
 */
export class ConsultaReportes {
  private readonly intentos = new Intentos();

  constructor(protected readonly repo: ReportesRepositorio) {}

  async consultar(id: ReporteId, params: Record<string, unknown>): Promise<Resultado | null> {
    const r = await firstValueFrom(this.repo.reporte(id, params));
    if (r.error) throw r.error;
    return (r.data?.reporte as Resultado | undefined) ?? null;
  }

  async exportar(id: ReporteId, params: Record<string, unknown>): Promise<string | undefined> {
    const r = await this.intentos.enviar('exportarReporte', { id, params }, (clave) => this.repo.exportar(id, params, clave));
    return r.data?.exportarReporte.url;
  }
}

/**
 * Fachada de la página de reportes: el catálogo (con clientes y rutas) y la consulta. El error del catálogo no se
 * descarta: con Analítica caída la página lo avisa en vez de quedar sin botones y sin explicación.
 */
@Injectable()
export class ReportesFachada extends ConsultaReportes {
  private readonly respuesta = toSignal(
    inject(ReportesRepositorio)
      .catalogo()
      .pipe(catchError((error: unknown) => of({ data: undefined, error }))),
  );
  readonly catalogo = computed(() => completo<CatalogoQuery>(this.respuesta()));
  readonly errorCatalogo = computed(() => this.respuesta()?.error);
  readonly cargandoCatalogo = computed(() => this.respuesta() === undefined);

  constructor() {
    super(inject(ReportesRepositorio));
  }
}
