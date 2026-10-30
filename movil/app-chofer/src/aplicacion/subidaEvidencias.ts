import { type EvidenciaLocal, type Parte, PARTES_EN_PARALELO, rango } from '../dominio/evidencia';
import type { Respuesta } from '../dominio/reintento';
import type { ApiEvidencias, Archivos, Evidencias } from './puertos';

export type ResultadoSubida = { listo: true } | { listo: false; respuesta: Respuesta };

/**
 * Sube las evidencias de una operación antes de enviarla (spec 006, D40a). Abrir la subida es idempotente por
 * `evidenciaId` y devuelve las partes que S3 ya tiene: si se cortó a la mitad, retoma solo las que faltan (de a 2,
 * D61). Una vez completa en el servidor, queda COMPLETA en el celular y no se vuelve a subir.
 */
export class SubidaEvidencias {
  constructor(
    private readonly evidencias: Evidencias,
    private readonly api: ApiEvidencias,
    private readonly archivos: Archivos,
  ) {}

  async asegurar(ids: string[], token: string): Promise<ResultadoSubida> {
    for (const id of ids) {
      const e = this.evidencias.porId(id);
      if (!e || e.estado === 'COMPLETA') continue;
      const r = await this.subir(e, token);
      if (!r.listo) return r;
    }
    return { listo: true };
  }

  private async subir(e: EvidenciaLocal, token: string): Promise<ResultadoSubida> {
    const { respuesta, subida } = await this.api.abrir(e, token);
    if (!subida) return { listo: false, respuesta };
    if (subida.estado === 'COMPLETA') return this.completa(e);

    const partes: Parte[] = [...subida.subidas];
    const pendientes = [...subida.partes];
    while (pendientes.length) {
      const tanda = pendientes.splice(0, PARTES_EN_PARALELO);
      const etags = await Promise.all(
        tanda.map((p) => {
          const { desde, hasta } = rango(p.numero, subida.tamanoParteBytes, e.tamanoBytes);
          return this.api.subirParte(p.url, this.archivos.leer(e.archivo, desde, hasta));
        }),
      );
      // Una parte que no llegó corta la tanda: la próxima vez S3 dirá cuáles ya tiene.
      if (etags.some((t) => t === null)) return { listo: false, respuesta: { estado: 'SIN_RED' } };
      tanda.forEach((p, i) => partes.push({ numero: p.numero, etag: etags[i]! }));
    }
    const fin = await this.api.completar(
      e,
      partes.sort((a, b) => a.numero - b.numero),
      token,
    );
    if (typeof fin.estado === 'number' && fin.estado >= 200 && fin.estado < 300) return this.completa(e);
    return { listo: false, respuesta: fin };
  }

  private completa(e: EvidenciaLocal): ResultadoSubida {
    this.evidencias.marcarCompleta(e.evidenciaId);
    return { listo: true };
  }
}
