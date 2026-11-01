import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, firstValueFrom, of, Subject, switchMap, tap } from 'rxjs';
import { completo, Intentos, Sesion, type Resultado } from 'ui-comun';
import { puedeVer } from 'ui-comun/dominio';
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
  private readonly repoCatalogo = inject(ReportesRepositorio);
  private readonly verClientes = puedeVer(inject(Sesion).roles(), 'clientes');
  /** Cada "Reintentar" vuelve a pedir el catálogo (V2-9). */
  private readonly intento = new BehaviorSubject<void>(undefined);
  /** Avisa cada respuesta: `recargarCatalogo` resuelve con la próxima (V4-3). */
  private readonly llegada = new Subject<void>();
  /** Mientras se reintenta se muestra que carga, sin quitar el aviso anterior: su botón conserva el foco (V4-3). */
  private readonly recargando = signal(false);
  private readonly respuesta = toSignal(
    this.intento.pipe(
      switchMap(() => this.repoCatalogo.catalogo(this.verClientes).pipe(catchError((error: unknown) => of({ data: undefined, error })))),
      tap(() => {
        this.recargando.set(false);
        this.llegada.next();
      }),
    ),
  );
  readonly catalogo = computed(() => completo<CatalogoQuery>(this.respuesta()));
  readonly errorCatalogo = computed(() => this.respuesta()?.error);
  readonly cargandoCatalogo = computed(() => this.respuesta() === undefined || this.recargando());

  constructor() {
    super(inject(ReportesRepositorio));
  }

  /** Resuelve cuando llega la respuesta nueva: «Reintentar» se ve y se anuncia mientras tanto (V4-3). */
  recargarCatalogo(): Promise<void> {
    const proxima = firstValueFrom(this.llegada);
    this.recargando.set(true);
    this.intento.next();
    return proxima;
  }
}
