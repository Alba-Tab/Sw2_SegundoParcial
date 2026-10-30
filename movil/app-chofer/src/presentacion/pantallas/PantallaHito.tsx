import { AudioModule, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform, ScrollView } from 'react-native';
import { Button, Chip, HelperText, Text, TextInput } from 'react-native-paper';
import { descripcionValida, puedeEscribir, TIPOS_HITO, type TipoHito } from '../../dominio/hito';
import { casos } from '../../datos/contenedor';
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
  const grabadora = useAudioRecorder(GRABACION_WAV);
  const [tipo, setTipo] = useState<TipoHito>('BLOQUEO');
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState<'VOZ' | 'TEXTO'>('TEXTO');
  const [estado, setEstado] = useState<'listo' | 'grabando' | 'transcribiendo'>('listo');
  const [error, setError] = useState<string | null>(null);
  const escribir = puedeEscribir(casos.velocidadKmh());
  const dictado = Platform.OS === 'ios';

  useEffect(() => precargarWhisper(), []);

  const dictar = async () => {
    setError(null);
    if (!(await AudioModule.requestRecordingPermissionsAsync()).granted) {
      setError('Sin permiso de micrófono: actívalo en Ajustes.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await grabadora.prepareToRecordAsync();
    grabadora.record();
    setEstado('grabando');
  };

  const terminar = async () => {
    await grabadora.stop();
    setEstado('transcribiendo');
    const uri = grabadora.uri;
    try {
      if (!uri) throw new Error('sin audio');
      const dicho = await transcribir(uri);
      setTexto((t) => (t ? `${t} ${dicho}` : dicho));
      setOrigen('VOZ');
    } catch {
      setError('No se pudo transcribir; intenta de nuevo.');
    } finally {
      if (uri) new File(uri).delete();
      setEstado('listo');
    }
  };

  const guardar = () => {
    try {
      casos.registrarHito(viajeId, tipo, texto, origen);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium">Tipo</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {TIPOS_HITO.map((t) => (
          <Chip key={t} selected={tipo === t} onPress={() => setTipo(t)}>
            {TIPOS[t]}
          </Chip>
        ))}
      </ScrollView>
      {dictado && (
        <Button
          mode={estado === 'grabando' ? 'contained-tonal' : 'contained'}
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
      <Button mode="contained" onPress={guardar} disabled={!descripcionValida(texto) || estado !== 'listo'}>
        Guardar en la bitácora
      </Button>
    </ScrollView>
  );
}
