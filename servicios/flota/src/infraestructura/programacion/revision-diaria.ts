import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { RevisarDocumentos } from '../../aplicacion/unidad/revisar-documentos';

/** America/La_Paz es UTC-4 todo el año (sin horario de verano). */
const DESFASE_LA_PAZ_H = 4;
const HORA_LOCAL = 6;

/** Milisegundos hasta las próximas 06:00 de La Paz. */
export function msHastaLaRevision(ahora: Date): number {
  const proxima = new Date(ahora);
  proxima.setUTCHours(HORA_LOCAL + DESFASE_LA_PAZ_H, 0, 0, 0);
  if (proxima <= ahora) proxima.setUTCDate(proxima.getUTCDate() + 1);
  return proxima.getTime() - ahora.getTime();
}

/**
 * D75: a las 06:00 America/La_Paz revisa los documentos de las unidades DISPONIBLE. Corre en el worker (siempre
 * encendido); si hay dos réplicas, RevisarDocumentos relee cada unidad en su transacción y no la cambia dos veces. A mano:
 * `node dist/cli.js unidades:revisar-documentos`.
 */
@Injectable()
export class RevisionDiaria implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(RevisionDiaria.name);
  private temporizador?: NodeJS.Timeout;

  constructor(@Inject(RevisarDocumentos) private readonly revisar: RevisarDocumentos) {}

  onApplicationBootstrap() {
    this.programar();
  }

  onApplicationShutdown() {
    clearTimeout(this.temporizador);
  }

  private programar() {
    this.temporizador = setTimeout(() => void this.correr(), msHastaLaRevision(new Date()));
    this.temporizador.unref();
  }

  private async correr() {
    try {
      const placas = await this.revisar.ejecutar();
      this.log.log(`Revisión diaria de documentos: ${placas.length ? placas.join(', ') : 'sin cambios'}`);
    } catch (e) {
      this.log.error(`Revisión diaria de documentos: ${(e as Error).message}`);
    } finally {
      this.programar();
    }
  }
}
