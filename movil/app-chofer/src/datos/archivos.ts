import { Directory, File, Paths } from 'expo-file-system';
import type { Archivos } from '../aplicacion/puertos';

/**
 * Las fotos y firmas se copian a una carpeta propia de la app: la cámara y el selector dejan archivos temporales que
 * el sistema puede borrar antes de que vuelva la señal.
 */
const carpetaEvidencias = () => new Directory(Paths.document, 'evidencias');

export const archivos: Archivos = {
  guardar(origen, nombre) {
    const carpeta = carpetaEvidencias();
    carpeta.create({ idempotent: true, intermediates: true });
    const destino = new File(carpeta, nombre);
    new File(origen).copy(destino);
    return { archivo: destino.uri, tamanoBytes: destino.size };
  },

  /** Lee solo los bytes de una parte (5 MB), sin cargar la foto entera en memoria. */
  leer(archivo, desde, hasta) {
    const h = new File(archivo).open();
    try {
      h.offset = desde;
      return h.readBytes(hasta - desde);
    } finally {
      h.close();
    }
  },
};

/** Al cerrar sesión: las fotos y firmas del chofer no quedan en el celular. */
export function borrarEvidencias(): void {
  try {
    const carpeta = carpetaEvidencias();
    if (carpeta.exists) carpeta.delete();
  } catch {
    // Si no se pudo borrar, la próxima entrega la vuelve a usar; las filas ya se borraron.
  }
}
