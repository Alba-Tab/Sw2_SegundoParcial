import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

/**
 * Fotos de la cámara en JPEG comprimido (< 15 MB, D66). La galería solo se usa si la cámara no existe (el simulador):
 * con el permiso negado en un celular real se pide activarlo, para que no entre una foto vieja como evidencia.
 */
export function useFotos(maximo: number) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const tomar = async () => {
    setError(null);
    const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
    const agregar = (r: ImagePicker.ImagePickerResult) => {
      if (!r.canceled) setFotos((f) => [...f, r.assets[0].uri].slice(0, maximo));
    };
    try {
      if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setError('Sin permiso de cámara: actívalo en Ajustes para tomar la foto.');
        return;
      }
      try {
        agregar(await ImagePicker.launchCameraAsync(opciones));
      } catch (e) {
        // Sin cámara (simulador, solo en desarrollo): la galería. En un celular real, una foto vieja no entra como evidencia.
        if (!__DEV__) throw e;
        agregar(await ImagePicker.launchImageLibraryAsync(opciones));
      }
    } catch {
      setError('No se pudo abrir la cámara. Inténtalo de nuevo.');
    }
  };

  return { fotos, tomar, quitar: (uri: string) => setFotos((f) => f.filter((x) => x !== uri)), error };
}
