/** Fotos y firmas del viaje (spec 006, D40a): se guardan en el celular y se suben a S3 por partes con URL firmadas. */
export type TipoEvidencia = 'FOTO_ENTREGA' | 'FIRMA' | 'FOTO_RECHAZO' | 'RECIBO_COMBUSTIBLE';

export interface EvidenciaLocal {
  evidenciaId: string;
  viajeId: string;
  tipo: TipoEvidencia;
  /** Copia en el almacenamiento de la app (la de la cámara puede borrarse). */
  archivo: string;
  contentType: 'image/jpeg' | 'image/png';
  tamanoBytes: number;
  estado: 'PENDIENTE' | 'COMPLETA';
}

export interface Parte {
  numero: number;
  etag: string;
}

/** D66: hasta 15 MB por evidencia. D61: hasta 2 partes en paralelo. D62: 60 s por parte. */
export const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024;
export const PARTES_EN_PARALELO = 2;
export const ESPERA_PARTE_MS = 60_000;

/** Qué bytes lleva la parte `numero` (desde 1) con partes de `tamanoParte` bytes. */
export function rango(numero: number, tamanoParte: number, tamanoTotal: number): { desde: number; hasta: number } {
  const desde = (numero - 1) * tamanoParte;
  return { desde, hasta: Math.min(desde + tamanoParte, tamanoTotal) };
}
