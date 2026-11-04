import { inject, Injectable } from '@angular/core';
import { CatalogoGQL, ExportarReporteGQL, PreguntarGQL, ReporteGQL, type FormatoExportacion, type ReporteId } from '../../graphql/generado';

/** Repositorio sobre Apollo de los reportes del catálogo, la pregunta por voz y la exportación a Excel o PDF (spec 015, D110). */
@Injectable({ providedIn: 'root' })
export class ReportesRepositorio {
  private readonly catalogoGql = inject(CatalogoGQL);
  private readonly reporteGql = inject(ReporteGQL);
  private readonly exportarGql = inject(ExportarReporteGQL);
  private readonly preguntarGql = inject(PreguntarGQL);

  catalogo(verClientes: boolean) {
    return this.catalogoGql.fetch({ variables: { verClientes } });
  }

  reporte(id: ReporteId, params: Record<string, unknown>) {
    return this.reporteGql.fetch({ variables: { id, params } });
  }

  exportar(id: ReporteId, params: Record<string, unknown>, formato: FormatoExportacion, clave: string) {
    return this.exportarGql.mutate({ variables: { id, params, formato, clave } });
  }

  preguntar(texto: string) {
    return this.preguntarGql.mutate({ variables: { texto } });
  }
}
