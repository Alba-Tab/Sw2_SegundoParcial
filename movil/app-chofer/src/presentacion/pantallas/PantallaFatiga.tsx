import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutRectangle, StyleSheet, Vibration, View } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Button, Text, useTheme } from 'react-native-paper';
import { Camera, CommonResolutions, type Frame, useCameraDevice, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import sonidoAlarma from '../../../assets/alarma.wav';
// Lo baja scripts/descargar-modelo.sh antes del build (no se versiona).
import modeloMalla from '../../../assets/modelos/face_landmark.tflite';
import { casos } from '../../datos/contenedor';
import { analizarCuadro, type Lectura, mallaDe, type Recorte } from '../../datos/mallaFacial';
import { BOSTEZOS_ALERTA, DetectorFatiga, EAR_CERRADO, medidas, type MotivoFatiga } from '../../dominio/fatiga';

const MOTIVOS: Record<MotivoFatiga, string> = { OJOS_CERRADOS: 'Ojos cerrados', BOSTEZOS: '3 bostezos en 2 minutos' };

/**
 * Spec 005, FO6 (D60): la cámara frontal en primer plano (iOS no deja usarla en segundo plano) mide los ojos y la boca
 * en cada cuadro. Con ojos cerrados 1,5 s o 3 bostezos en 2 minutos suena la alarma y queda un `ALERTA_FATIGA` en la
 * cola, con o sin señal. La pantalla dibuja la caja del rostro y las etiquetas; las imágenes no se guardan.
 */
export function PantallaFatiga({ viajeId, alAlertar }: { viajeId: string; alAlertar: (enCola: boolean) => void }) {
  useKeepAwake();
  const tema = useTheme();
  const permiso = useCameraPermission();
  const camara = useCameraDevice('front');
  const malla = useTensorflowModel(modeloMalla, []);
  const modelo = malla.state === 'loaded' ? malla.model : undefined;
  const alarma = useAudioPlayer(sonidoAlarma);
  const [recorte] = useState(() => createSynchronizable<Recorte | null>(null));
  const detector = useRef(new DetectorFatiga());
  // Un solo estado por cuadro (la lectura y lo que se dibuja con ella): un render por cuadro, no dos.
  const [cuadro, setCuadro] = useState<{ lectura: Lectura; ear: number; bostezos: number } | null>(null);
  const [alerta, setAlerta] = useState<MotivoFatiga | null>(null);
  const [vista, setVista] = useState<LayoutRectangle | null>(null);
  // El aviso de la pantalla de arriba va en una referencia: si cambia, no se recrea el *frame processor*.
  const avisar = useRef(alAlertar);
  useEffect(() => {
    avisar.current = alAlertar;
  }, [alAlertar]);

  useEffect(() => {
    if (!permiso.hasPermission) void permiso.requestPermission();
    void setAudioModeAsync({ playsInSilentMode: true });
  }, [permiso]);

  const alLeer = useCallback(
    (l: Lectura) => {
      const ahora = Date.now();
      const m = l.caja ? medidas(mallaDe(l)) : null;
      const motivo = detector.current.muestra(ahora, m);
      setCuadro({ lectura: l, ear: m?.ear ?? 0, bostezos: detector.current.bostezosRecientes(ahora) });
      if (!motivo) return;
      setAlerta(motivo);
      alarma.seekTo(0);
      alarma.play();
      Vibration.vibrate([0, 600, 200, 600]);
      avisar.current(casos.registrarFatiga(viajeId) !== null);
    },
    [alarma, viajeId],
  );

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (modelo == null) return;
        const r = analizarCuadro(frame, modelo, recorte.getDirty());
        recorte.setBlocking(r.recorte);
        scheduleOnRN(alLeer, r.lectura);
      } finally {
        frame.dispose();
      }
    },
    [modelo, recorte, alLeer],
  );
  const salida = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: CommonResolutions.VGA_4_3,
    enablePhysicalBufferRotation: true,
    onFrame,
  });

  if (!permiso.hasPermission) {
    return (
      <View style={estilos.centro}>
        <Text variant="bodyLarge">Sin permiso de cámara: actívalo en Ajustes para usar el detector.</Text>
        <Button mode="contained" onPress={() => void permiso.requestPermission()}>
          Dar permiso
        </Button>
      </View>
    );
  }
  if (!camara) return <Text style={{ padding: 24 }}>Este celular no tiene cámara frontal.</Text>;

  const lectura = cuadro?.lectura ?? null;
  const caja = lectura?.caja && vista ? enVista(lectura, lectura.caja, vista) : null;
  const ojosCerrados = lectura?.caja != null && (cuadro?.ear ?? 0) < EAR_CERRADO;
  const color = alerta ? tema.colors.error : ojosCerrados ? tema.colors.tertiary : tema.colors.primary;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} onLayout={(e) => setVista(e.nativeEvent.layout)}>
        <Camera style={StyleSheet.absoluteFill} device={camara} isActive outputs={[salida]} resizeMode="cover" />
        {caja && (
          <View
            accessibilityLabel="Rostro detectado"
            style={[estilos.caja, { left: caja.x, top: caja.y, width: caja.ancho, height: caja.alto, borderColor: color }]}
          >
            <Text style={[estilos.etiqueta, { backgroundColor: color, color: tema.colors.onPrimary }]}>
              {ojosCerrados ? 'Ojos cerrados' : 'Ojos abiertos'} · EAR {(cuadro?.ear ?? 0).toFixed(2)}
            </Text>
          </View>
        )}
      </View>
      <View style={[estilos.panel, { backgroundColor: alerta ? tema.colors.errorContainer : tema.colors.surface }]}>
        <Text variant="titleMedium" style={{ color: alerta ? tema.colors.onErrorContainer : tema.colors.onSurface }}>
          {alerta
            ? `¡${MOTIVOS[alerta]}! Detente a descansar`
            : !modelo
              ? 'Cargando el modelo…'
              : lectura?.caja
                ? 'Rostro detectado'
                : 'Busca tu rostro en la cámara'}
        </Text>
        <Text variant="bodyMedium">
          Bostezos en 2 minutos: {cuadro?.bostezos ?? 0} de {BOSTEZOS_ALERTA}. Las imágenes no se guardan.
        </Text>
        {alerta && (
          <Button mode="contained-tonal" onPress={() => setAlerta(null)}>
            Entendido
          </Button>
        )}
      </View>
    </View>
  );
}

/** Caja en píxeles del cuadro → puntos de la vista (vista previa en modo `cover`, espejada en la cámara frontal). */
function enVista(l: Lectura, c: NonNullable<Lectura['caja']>, vista: LayoutRectangle) {
  const escala = Math.max(vista.width / l.ancho, vista.height / l.alto);
  const dx = (vista.width - l.ancho * escala) / 2;
  const dy = (vista.height - l.alto * escala) / 2;
  const x = l.espejo ? l.ancho - c.x - c.ancho : c.x;
  return { x: dx + x * escala, y: dy + c.y * escala, ancho: c.ancho * escala, alto: c.alto * escala };
}

const estilos = StyleSheet.create({
  centro: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  caja: { position: 'absolute', borderWidth: 3, borderRadius: 8 },
  etiqueta: { position: 'absolute', top: -26, left: -3, paddingHorizontal: 6, paddingVertical: 2, fontSize: 13 },
  panel: { padding: 16, gap: 8 },
});
