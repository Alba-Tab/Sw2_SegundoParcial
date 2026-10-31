import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReportesRepositorio } from '../reportes/data/reportes.repositorio';
import { ConsultaReportes } from '../reportes/reportes.fachada';
import type { Respuesta } from './domain/voz';

/** Fachada de la pregunta por voz (CU-16, spec 015): Analítica decide el reporte en código; aquí solo se pide. */
@Injectable()
export class VozFachada extends ConsultaReportes {
  constructor() {
    super(inject(ReportesRepositorio));
  }

  async preguntar(texto: string): Promise<Respuesta | null> {
    const r = await firstValueFrom(this.repo.preguntar(texto));
    return r.data?.preguntar ?? null;
  }
}
