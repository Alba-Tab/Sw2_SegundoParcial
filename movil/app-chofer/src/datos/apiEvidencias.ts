import type { ApiEvidencias, Subida } from '../aplicacion/puertos';
import { ESPERA_PARTE_MS } from '../dominio/evidencia';
import { completarSubidaEvidencia, crearSubidaEvidencia, type SubidaEvidencia } from './api/generado/viajes';
import { respuesta } from './apiViajes';

type Crudo = { data: unknown; status: number; headers: Headers };

/** Subida por partes con URL firmadas de S3 (spec 006, D40a): abrir y completar en Viajes, las partes directo a S3. */
export class ApiEvidenciasHttp implements ApiEvidencias {
  async abrir(e: Parameters<ApiEvidencias['abrir']>[0], token: string) {
    try {
      const r = (await crearSubidaEvidencia(
        e.viajeId,
        { evidenciaId: e.evidenciaId, tipo: e.tipo, contentType: e.contentType, tamanoBytes: e.tamanoBytes },
        // El evidenciaId es la autoridad de idempotencia; la clave solo identifica el intento.
        { headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': e.evidenciaId } },
      )) as Crudo;
      if (r.status !== 200 && r.status !== 201) return { respuesta: await respuesta(async () => r), subida: null };
      const s = r.data as SubidaEvidencia;
      const subida: Subida = {
        estado: s.estado,
        tamanoParteBytes: s.tamanoParteBytes,
        partes: s.partes.map((p) => ({ numero: p.numero, url: p.url })),
        subidas: s.subidas,
      };
      return { respuesta: { estado: r.status }, subida };
    } catch {
      return { respuesta: { estado: 'SIN_RED' as const }, subida: null };
    }
  }

  async subirParte(url: string, bytes: Uint8Array): Promise<string | null> {
    try {
      const cuerpo = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const r = await fetch(url, { method: 'PUT', body: cuerpo, signal: AbortSignal.timeout(ESPERA_PARTE_MS) });
      return r.ok ? r.headers.get('ETag') : null;
    } catch {
      return null;
    }
  }

  completar(e: Parameters<ApiEvidencias['completar']>[0], partes: Parameters<ApiEvidencias['completar']>[1], token: string) {
    return respuesta(() =>
      completarSubidaEvidencia(
        e.viajeId,
        e.evidenciaId,
        { partes },
        { headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': `${e.evidenciaId}` } },
      ),
    );
  }
}
