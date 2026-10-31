import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import { Intentos, type Resultado } from 'ui-comun';
import type { ReporteId } from '../graphql/generado';
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

/** Fachada de la página de reportes: el catálogo (con clientes y rutas) y la consulta. */
@Injectable()
export class ReportesFachada extends ConsultaReportes {
  readonly catalogo = toSignal(
    inject(ReportesRepositorio)
      .catalogo()
      .pipe(map((r) => r.data)),
  );

  constructor() {
    super(inject(ReportesRepositorio));
  }
}
