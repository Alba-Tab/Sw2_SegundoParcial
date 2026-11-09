import { Directory, File, Paths } from 'expo-file-system';
import type { Archivos } from '../aplicacion/puertos';
import { ErrorDeUsuario } from '../dominio/errores';

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
    // `copy` devuelve una promesa: sin esperar, el tamaño todavía es null (NOT NULL en evidencia_local).
    // react-native-view-shot puede devolver en Android una ruta sin esquema; File exige file://.
    new File(origen.includes('://') ? origen : `file://${origen}`).copySync(destino);
    const tamanoBytes = destino.size;
    if (!tamanoBytes) {
      if (destino.exists) destino.delete();
      throw new ErrorDeUsuario('No se pudo guardar la imagen. Vuelve a intentarlo.');
    }
    return { archivo: destino.uri, tamanoBytes };
  },

  existe(archivo) {
    try {
      return new File(archivo).exists;
    } catch {
      return false;
    }
  },

  borrar(archivo) {
    try {
      const f = new File(archivo);
      if (f.exists) f.delete();
    } catch {
      // Si no se pudo, se borra con la carpeta al cerrar sesión.
    }
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
