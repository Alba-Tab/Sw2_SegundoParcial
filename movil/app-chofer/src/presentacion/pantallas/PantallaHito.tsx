import { AudioModule, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { Button, Chip, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { descripcionValida, puedeEscribir, TIPOS_HITO, type TipoHito } from '../../dominio/hito';
import { casos } from '../../datos/contenedor';
import { mensajeDe } from '../errores';
import { GRABACION_WAV, precargarWhisper, transcribir } from '../../datos/voz';

const TIPOS: Record<TipoHito, string> = {
  BLOQUEO: 'Bloqueo',
  PARADA: 'Parada',
  PUNTO_CONTROL: 'Punto de control',
  FALLA_MECANICA: 'Falla mecánica',
  OTRO: 'Otro',
};

/**
 * Spec 005, paso 7 (CU-06): el chofer dicta, revisa el texto y elige el tipo. Whisper transcribe en el celular sin red;
 * el audio se borra al terminar (D53). En movimiento (> 5 km/h) el texto solo se dicta (D58).
 */
export function PantallaHito({ viajeId, alGuardar }: { viajeId: string; alGuardar: () => void }) {
  const tema = useTheme();
  const grabadora = useAudioRecorder(GRABACION_WAV);
  const [tipo, setTipo] = useState<TipoHito>('BLOQUEO');
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState<'VOZ' | 'TEXTO'>('TEXTO');
  const [estado, setEstado] = useState<'listo' | 'grabando' | 'transcribiendo'>('listo');
  const [error, setError] = useState<string | null>(null);
  // Velocidad desconocida = 0 para D58 (a propósito, distinto de SIN_ROSTRO): el chofer sin GPS no queda bloqueado.
  const escribir = puedeEscribir(casos.velocidadKmh() ?? 0);
  const dictado = Platform.OS === 'ios';

  useEffect(() => precargarWhisper(), []);

  const dictar = async () => {
    setError(null);
    try {
      if (!(await AudioModule.requestRecordingPermissionsAsync()).granted) {
        setError('Sin permiso de micrófono: actívalo en Ajustes.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await grabadora.prepareToRecordAsync();
      grabadora.record();
      setEstado('grabando');
    } catch {
      setError('No se pudo usar el micrófono; intenta de nuevo.');
      setEstado('listo');
    }
  };

  const terminar = async () => {
    setEstado('transcribiendo');
    let uri: string | null = null;
    try {
      await grabadora.stop();
      uri = grabadora.uri;
      if (!uri) throw new Error('sin audio');
      const dicho = await transcribir(uri);
      setTexto((t) => (t ? `${t} ${dicho}` : dicho));
      setOrigen('VOZ');
    } catch {
      setError('No se pudo transcribir; intenta de nuevo.');
    } finally {
      setEstado('listo');
      // El audio no se guarda (D53); si ya no está, no importa.
      try {
        if (uri && new File(uri).exists) new File(uri).delete();
      } catch {
        // nada que borrar
      }
    }
  };

  const guardar = () => {
    setError(null);
    if (!descripcionValida(texto)) {
      setError('Escribe o dicta al menos 3 caracteres.');
      return;
    }
    try {
      casos.registrarHito(viajeId, tipo, texto, origen);
      alGuardar();
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
    >
      <Text variant="titleMedium">Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TIPOS_HITO.map((t) => (
          <Chip
            key={t}
            selected={tipo === t}
            showSelectedCheck
            // Contorno para los no elegidos y relleno para el elegido: con el mismo relleno solo el ✓ los distinguía.
            mode={tipo === t ? 'flat' : 'outlined'}
            onPress={() => setTipo(t)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            {TIPOS[t]}
          </Chip>
        ))}
      </View>
      {dictado && (
        <Button
          // Guardar es la acción principal; dictar va un escalón abajo (rojo mientras graba).
          mode={estado === 'grabando' ? 'contained' : 'contained-tonal'}
          buttonColor={estado === 'grabando' ? tema.colors.error : undefined}
          icon={estado === 'grabando' ? 'stop' : 'microphone'}
          onPress={() => void (estado === 'grabando' ? terminar() : dictar())}
          loading={estado === 'transcribiendo'}
          disabled={estado === 'transcribiendo'}
          contentStyle={{ paddingVertical: 12 }}
        >
          {estado === 'grabando' ? 'Terminar de dictar' : estado === 'transcribiendo' ? 'Transcribiendo…' : 'Dictar'}
        </Button>
      )}
      <TextInput
        mode="outlined"
        label="Descripción"
        multiline
        value={texto}
        editable={escribir}
        onChangeText={(t) => {
          setTexto(t);
          if (origen === 'TEXTO' || !t) setOrigen('TEXTO');
        }}
        maxLength={500}
      />
      {!escribir && <HelperText type="info">En movimiento solo se puede dictar.</HelperText>}
      {!dictado && !escribir && <HelperText type="info">Detén el camión para escribir el hito.</HelperText>}
      {error && <HelperText type="error">{error}</HelperText>}
      <Button mode="contained" onPress={guardar} disabled={estado !== 'listo'} contentStyle={{ paddingVertical: 8 }}>
        Guardar en la bitácora
      </Button>
    </ScrollView>
  );
}
