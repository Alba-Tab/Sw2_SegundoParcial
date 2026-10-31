import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, type LayoutRectangle, StyleSheet, Vibration, View } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import { Camera, CommonResolutions, type Frame, useCameraDevice, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import sonidoAlarma from '../../../assets/alarma.wav';
// Los baja scripts/descargar-modelo.sh antes del build (no se versionan).
import modeloGestos from '../../../assets/modelos/face_blendshapes.tflite';
import modeloDetector from '../../../assets/modelos/face_detector.tflite';
import modeloMalla from '../../../assets/modelos/face_landmarks_detector.tflite';
import { casos } from '../../datos/contenedor';
import { analizarCuadro, type Lectura, type Recorte } from '../../datos/mallaFacial';
import { BOSTEZOS_ALERTA, DetectorFatiga, type MotivoFatiga, OJO_CERRADO } from '../../dominio/fatiga';

const MOTIVOS: Record<MotivoFatiga, string> = {
  OJOS_CERRADOS: 'Cerraste los ojos',
  SOMNOLENCIA: 'Estás parpadeando lento',
  CABECEO: 'Se te cae la cabeza',
  SIN_ROSTRO: 'No se ve tu rostro',
  BOSTEZOS: '3 bostezos en 2 minutos',
};

/**
 * Spec 005, FO6 (D60): la cámara frontal en primer plano (iOS no deja usarla en segundo plano) mide ojos, boca y cabeza
 * en cada cuadro. Ante cualquier motivo de D60 suena la alarma, la pantalla se vuelve roja y queda un `ALERTA_FATIGA`
 * en la cola, con o sin señal. La pantalla dibuja la caja del rostro y su etiqueta; las imágenes no se guardan.
 */
export function PantallaFatiga({ viajeId, alAlertar }: { viajeId: string; alAlertar: (enCola: boolean) => void }) {
  useKeepAwake();
  const tema = useTheme();
  const permiso = useCameraPermission();
  const camara = useCameraDevice('front');
  const detectorTf = useTensorflowModel(modeloDetector, []);
  const mallaTf = useTensorflowModel(modeloMalla, []);
  const gestosTf = useTensorflowModel(modeloGestos, []);
  const [d, m, g] = [detectorTf.model, mallaTf.model, gestosTf.model];
  // Memorizado: un objeto nuevo por render recrearía el *frame processor* en cada cuadro.
  const modelos = useMemo(() => (d && m && g ? { detector: d, malla: m, gestos: g } : undefined), [d, m, g]);
  const fallo = detectorTf.state === 'error' || mallaTf.state === 'error' || gestosTf.state === 'error';
  const alarma = useAudioPlayer(sonidoAlarma);
  const [recorte] = useState(() => createSynchronizable<Recorte | null>(null));
  const detector = useRef(new DetectorFatiga());
  // Un solo estado para lo que se dibuja, y solo cuando cambia algo visible: no un render de la pantalla por cuadro.
  const [cuadro, setCuadro] = useState<{ lectura: Lectura; bostezos: number; visible: boolean } | null>(null);
  const [alerta, setAlerta] = useState<MotivoFatiga | null>(null);
  // Una alerta abierta (hasta «Estoy bien») encola un solo ALERTA_FATIGA aunque se sumen otros motivos.
  const abierta = useRef(false);
  const [falloCuadro, setFalloCuadro] = useState(false);
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
      const motivo = detector.current.muestra(ahora, l.medidas);
      const nuevo = { lectura: l, bostezos: detector.current.bostezosRecientes(ahora), visible: detector.current.rostroVisible };
      setCuadro((c) => (c && !cambioVisible(c, nuevo) ? c : nuevo));
      // Un cuadro que falló no apaga el detector: si los siguientes andan, el aviso se va.
      setFalloCuadro(false);
      if (!motivo) return;
      setAlerta(motivo);
      AccessibilityInfo.announceForAccessibility(`${MOTIVOS[motivo]}. Detente a descansar`);
      if (abierta.current) return;
      abierta.current = true;
      // La alarma y la vibración siguen hasta «Estoy bien»: un pitido de 1 s no despierta a nadie.
      alarma.seekTo(0);
      alarma.play();
      Vibration.vibrate([0, 600, 200, 600], true);
      avisar.current(casos.registrarFatiga(viajeId) !== null);
    },
    [alarma, viajeId],
  );
  // El sonido dura 1,2 s: mientras la alerta siga abierta, vuelve a empezar al terminar.
  const sonando = useAudioPlayerStatus(alarma);
  useEffect(() => {
    if (!sonando.didJustFinish || !abierta.current) return;
    alarma.seekTo(0);
    alarma.play();
  }, [sonando.didJustFinish, alarma]);
  const apagar = useCallback(() => {
    abierta.current = false;
    alarma.pause();
    Vibration.cancel();
  }, [alarma]);
  // Si sale con «atrás» con la alarma sonando: la vibración se corta aquí. El sonido no se pausa: al desmontar,
  // useAudioPlayer ya liberó el reproductor (pausarlo lanzaba «Unable to find the native shared object») y eso lo calla.
  useEffect(
    () => () => {
      abierta.current = false;
      Vibration.cancel();
    },
    [],
  );
  const alFallar = useCallback(() => setFalloCuadro(true), []);

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (modelos == null) return;
        const r = analizarCuadro(frame, modelos, recorte.getDirty());
        recorte.setBlocking(r.recorte);
        scheduleOnRN(alLeer, r.lectura);
      } catch {
        recorte.setBlocking(null);
        scheduleOnRN(alFallar);
      } finally {
        frame.dispose();
      }
    },
    [modelos, recorte, alLeer, alFallar],
  );
  const salida = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: CommonResolutions.VGA_4_3,
    enablePhysicalBufferRotation: true,
    onFrame,
    // Con tres modelos por cuadro se descartan cuadros: es lo esperado, no un aviso por cuadro.
    onFrameDropped: () => {},
  });
  const salidas = useMemo(() => [salida], [salida]);

  if (!permiso.hasPermission) {
    return (
      <View style={estilos.centro}>
        <Icon source="camera-off" size={48} />
        <Text variant="titleMedium">El detector necesita la cámara frontal</Text>
        <Text variant="bodyMedium">Si ya la negaste, actívala en Ajustes › App Chofer › Cámara.</Text>
        <Button mode="contained" onPress={() => void permiso.requestPermission()} contentStyle={estilos.botonAlto}>
          Dar permiso
        </Button>
      </View>
    );
  }
  if (!camara) {
    return (
      <View style={estilos.centro}>
        <Icon source="camera-off" size={48} />
        <Text variant="titleMedium">Este celular no tiene cámara frontal</Text>
      </View>
    );
  }

  const lectura = cuadro?.lectura ?? null;
  const caja = lectura?.caja && vista ? enVista(lectura, lectura.caja, vista) : null;
  const ojosCerrados = (lectura?.medidas?.ojos ?? 0) >= OJO_CERRADO;
  const color = ojosCerrados ? tema.colors.tertiary : tema.colors.primary;
  const vigilando = !!lectura?.caja && !!cuadro?.visible;
  const estado =
    fallo || falloCuadro
      ? 'El detector falló. Sal y vuelve a entrar.'
      : !modelos
        ? 'Preparando el detector…'
        : vigilando
          ? 'Vigilando. Maneja tranquilo.'
          : lectura?.caja
            ? 'No se ve bien tu rostro'
            : 'Pon tu cara dentro del óvalo';
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} onLayout={(e) => setVista(e.nativeEvent.layout)}>
        <Camera style={StyleSheet.absoluteFill} device={camara} isActive outputs={salidas} resizeMode="cover" />
        {!vigilando && modelos && <View pointerEvents="none" style={[estilos.ovalo, { borderColor: tema.colors.onSurface }]} />}
        {caja && (
          <View
            accessibilityLabel={ojosCerrados ? 'Rostro detectado, ojos cerrados' : 'Rostro detectado, ojos abiertos'}
            style={[estilos.caja, { left: caja.x, top: caja.y, width: caja.ancho, height: caja.alto, borderColor: color }]}
          >
            <Text style={[estilos.etiqueta, { backgroundColor: color, color: tema.colors.onPrimary }]}>
              {ojosCerrados ? 'Ojos cerrados' : 'Ojos abiertos'}
            </Text>
          </View>
        )}
      </View>
      <View style={[estilos.panel, { backgroundColor: tema.colors.surface }]}>
        <Text variant="titleLarge" accessibilityLiveRegion="polite">
          {estado}
        </Text>
        <Text variant="bodyLarge" style={{ color: tema.colors.onSurfaceVariant }}>
          Bostezos: {cuadro?.bostezos ?? 0} de {BOSTEZOS_ALERTA} · Las imágenes no se guardan
        </Text>
      </View>
      {alerta && (
        <View
          style={[StyleSheet.absoluteFill, estilos.alerta, { backgroundColor: ALERTA.fondo }]}
          accessibilityViewIsModal
          accessibilityLiveRegion="assertive"
        >
          <Icon source="alert-octagon" size={96} color={ALERTA.texto} />
          <Text variant="displaySmall" style={[estilos.textoAlerta, { color: ALERTA.texto }]}>
            {MOTIVOS[alerta]}
          </Text>
          <Text variant="titleLarge" style={[estilos.textoAlerta, { color: ALERTA.texto }]}>
            Detente en un lugar seguro y descansa
          </Text>
          <Button
            mode="contained"
            buttonColor={ALERTA.texto}
            textColor={ALERTA.fondo}
            style={{ alignSelf: 'stretch' }}
            contentStyle={{ minHeight: 64 }}
            labelStyle={{ fontSize: 22, lineHeight: 28 }}
            onPress={() => {
              apagar();
              setAlerta(null);
            }}
          >
            Estoy bien
          </Button>
        </View>
      )}
    </View>
  );
}

/** ¿Cambió algo que se ve? La caja se mueve más de 4 px, los ojos, los bostezos o si el rostro cuenta como visible. */
function cambioVisible(a: { lectura: Lectura; bostezos: number; visible: boolean }, b: typeof a): boolean {
  const ca = a.lectura.caja;
  const cb = b.lectura.caja;
  if (!ca || !cb) return ca !== cb;
  return (
    a.bostezos !== b.bostezos ||
    a.visible !== b.visible ||
    (a.lectura.medidas?.ojos ?? 0) >= OJO_CERRADO !== (b.lectura.medidas?.ojos ?? 0) >= OJO_CERRADO ||
    Math.abs(ca.x - cb.x) > 4 ||
    Math.abs(ca.y - cb.y) > 4 ||
    Math.abs(ca.ancho - cb.ancho) > 4
  );
}

/**
 * Caja en píxeles del cuadro → puntos de la vista (vista previa en modo `cover`, espejada en la cámara frontal). Con el
 * `mirrorMode` por defecto, `isMirrored` no sigue a la documentación de `Frame.nitro.ts`: en iOS vale
 * `connection.isVideoMirrored` y el búfer ya llega espejado como la vista previa; en Android vale false y CameraX no
 * espeja el búfer. Por eso se espeja cuando es false. No pasar `mirrorMode` a `useFrameOutput`: con 'on', en Android la
 * caja vuelve a salir del lado contrario.
 */
function enVista(l: Lectura, c: NonNullable<Lectura['caja']>, vista: LayoutRectangle) {
  const escala = Math.max(vista.width / l.ancho, vista.height / l.alto);
  const dx = (vista.width - l.ancho * escala) / 2;
  const dy = (vista.height - l.alto * escala) / 2;
  const x = l.espejo ? c.x : l.ancho - c.x - c.ancho;
  return { x: dx + x * escala, y: dy + c.y * escala, ancho: c.ancho * escala, alto: c.alto * escala };
}

/** Rojo fijo en claro y oscuro: el `error` del tema oscuro es rosado pastel y pierde urgencia justo de noche. */
const ALERTA = { fondo: '#ba1a1a', texto: '#ffffff' };

const estilos = StyleSheet.create({
  centro: { flex: 1, padding: 24, gap: 16, justifyContent: 'center', alignItems: 'center' },
  caja: { position: 'absolute', borderWidth: 3, borderRadius: 12 },
  etiqueta: { position: 'absolute', top: -34, left: -3, paddingHorizontal: 8, paddingVertical: 4, fontSize: 18, borderRadius: 6 },
  ovalo: {
    position: 'absolute',
    alignSelf: 'center',
    top: '15%',
    width: '60%',
    aspectRatio: 0.75,
    borderWidth: 3,
    borderRadius: 999,
    borderStyle: 'dashed',
    opacity: 0.7,
  },
  panel: { padding: 20, gap: 6 },
  alerta: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  textoAlerta: { textAlign: 'center' },
  botonAlto: { paddingVertical: 10, paddingHorizontal: 24 },
});
