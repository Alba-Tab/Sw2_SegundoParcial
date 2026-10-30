import { Directory, File, Paths } from 'expo-file-system';
import type { Archivos } from '../aplicacion/puertos';

/**
 * Las fotos y firmas se copian a una carpeta propia de la app: la cámara y el selector dejan archivos temporales que
 * el sistema puede borrar antes de que vuelva la señal.
 */
export const archivos: Archivos = {
  guardar(origen, nombre) {
    const carpeta = new Directory(Paths.document, 'evidencias');
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
