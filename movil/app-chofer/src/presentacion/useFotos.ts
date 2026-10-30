import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

/** Fotos de la cámara (o de la galería si no hay cámara, como en el simulador), en JPEG comprimido (< 15 MB, D66). */
export function useFotos(maximo: number) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const tomar = async () => {
    setError(null);
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
    try {
      const r = permiso.granted ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      if (!r.canceled) setFotos((f) => [...f, r.assets[0].uri].slice(0, maximo));
    } catch {
      // Sin cámara (simulador): la galería.
      const r = await ImagePicker.launchImageLibraryAsync(opciones);
      if (!r.canceled) setFotos((f) => [...f, r.assets[0].uri].slice(0, maximo));
      else setError('No se pudo abrir la cámara');
    }
  };

  return { fotos, tomar, quitar: (uri: string) => setFotos((f) => f.filter((x) => x !== uri)), error };
}
