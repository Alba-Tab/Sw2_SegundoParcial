import {
  AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, IOSOutputFormat, AudioQuality, type RecordingOptions,
} from 'expo-audio';
import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { Button, Card, MD3LightTheme, PaperProvider, Text } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { detenerGps, iniciarGps, resumenGps } from './src/gps';
import { KC_URL, probarLogin, probarPush, probarSqlite, probarTflite, probarWhisperMuestra, transcribir } from './src/pruebas';

// WAV PCM 16 kHz mono de 16 bits, lo que acepta whisper.rn (solo iOS: Android no graba WAV con MediaRecorder).
const GRABACION_WAV: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  ios: { outputFormat: IOSOutputFormat.LINEARPCM, audioQuality: AudioQuality.MAX, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
};

type Prueba = { titulo: string; accion: () => Promise<string> };
const AUTOMATICAS = ['SQLite (cola local)', 'TFLite: detector de rostro', 'Whisper base: muestra en español'];

function Tarjeta({ titulo, accion }: Prueba) {
  const [estado, setEstado] = useState('sin correr');
  const [ocupado, setOcupado] = useState(false);
  return (
    <Card style={estilos.tarjeta} mode="elevated">
      <Card.Title title={titulo} />
      <Card.Content><Text variant="bodySmall" selectable>{estado}</Text></Card.Content>
      <Card.Actions>
        <Button mode="contained" loading={ocupado} disabled={ocupado} onPress={async () => {
          setOcupado(true);
          let r: string;
          try { r = await accion(); } catch (e) { r = `ERROR: ${String(e)}`; }
          setEstado(r);
          console.log(`RESULTADO [${titulo}] ${r}`);
          setOcupado(false);
        }}>Probar</Button>
      </Card.Actions>
    </Card>
  );
}

export default function App() {
  const grabadora = useAudioRecorder(GRABACION_WAV);
  const [gps, setGps] = useState(resumenGps());
  useEffect(() => { const i = setInterval(() => setGps(resumenGps()), 5000); return () => clearInterval(i); }, []);

  const grabarYTranscribir = async () => {
    if (Platform.OS !== 'ios') return 'Grabar WAV solo en iOS; en Android se usa la muestra.';
    const p = await AudioModule.requestRecordingPermissionsAsync();
    if (!p.granted) return 'sin permiso de micrófono';
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await grabadora.prepareToRecordAsync();
    grabadora.record();
    await new Promise((r) => setTimeout(r, 5000));
    await grabadora.stop();
    return transcribir(grabadora.uri!);
  };

  const pruebas: Prueba[] = [
    { titulo: 'SQLite (cola local)', accion: probarSqlite },
    { titulo: 'Login Keycloak (PKCE + offline_access)', accion: probarLogin },
    { titulo: 'Whisper base: muestra en español', accion: probarWhisperMuestra },
    { titulo: 'Whisper base: grabar 5 s y transcribir', accion: grabarYTranscribir },
    { titulo: 'TFLite: detector de rostro', accion: probarTflite },
    { titulo: 'Push FCM (Android)', accion: probarPush },
    { titulo: 'GPS en segundo plano: iniciar', accion: iniciarGps },
    { titulo: 'GPS en segundo plano: detener', accion: async () => { await detenerGps(); return 'detenido'; } },
  ];

  return (
    <SafeAreaProvider>
      <PaperProvider theme={MD3LightTheme}>
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={estilos.contenido}>
            <Text variant="headlineSmall">PoC-4 App del chofer</Text>
            <Text variant="bodySmall">{Platform.OS} {Platform.Version} · {Device.modelName} · {Device.isDevice ? 'dispositivo' : 'emulador'}</Text>
            <Text variant="bodySmall">Keycloak: {KC_URL}</Text>
            <Card style={estilos.tarjeta}>
              <Card.Title title="Puntos GPS guardados" />
              <Card.Content>
                <Text variant="bodySmall">{gps.n} puntos ({gps.fondo ?? 0} en segundo plano){'\n'}primero {gps.primero}{'\n'}último {gps.ultimo}</Text>
              </Card.Content>
            </Card>
            <Button mode="outlined" onPress={async () => {
              for (const p of pruebas.filter((x) => AUTOMATICAS.includes(x.titulo))) {
                let r: string;
                try { r = await p.accion(); } catch (e) { r = `ERROR: ${String(e)}`; }
                console.log(`RESULTADO [${p.titulo}] ${r}`);
              }
            }}>Correr pruebas automáticas</Button>
            {pruebas.map((p) => <Tarjeta key={p.titulo} {...p} />)}
          </ScrollView>
        </SafeAreaView>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  tarjeta: { marginTop: 4 },
});
