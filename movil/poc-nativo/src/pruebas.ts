// Pruebas de la PoC-4. Cada una devuelve un texto corto con el resultado y los tiempos medidos.
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import { initWhisper, type WhisperContext } from 'whisper.rn';
import { db } from './db';

const MAC = 'MacBook-Air-de-Brayan.local';
// El emulador de Android no resuelve mDNS: llega a la Mac por 10.0.2.2.
export const KC_URL = Platform.OS === 'android' && !Device.isDevice ? 'http://10.0.2.2:8080' : `http://${MAC}:8080`;
const URL_WHISPER = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin';

const ms = (t: number) => `${Math.round(performance.now() - t)} ms`;

export async function probarSqlite(): Promise<string> {
  const t = performance.now();
  db.withTransactionSync(() => {
    for (let i = 0; i < 500; i++) {
      db.runSync('INSERT OR IGNORE INTO cola (clave, tipo, cuerpo, creado_en) VALUES (?, ?, ?, ?)',
        Crypto.randomUUID(), 'HITO', JSON.stringify({ i }), new Date().toISOString());
    }
  });
  const n = db.getFirstSync<{ n: number }>('SELECT count(*) n FROM cola')!.n;
  return `500 escrituras en una transacción: ${ms(t)}; filas en la cola: ${n}`;
}

export async function probarTflite(): Promise<string> {
  const delegado = Platform.OS === 'ios' ? 'core-ml' : 'android-gpu';
  const partes: string[] = [];
  for (const d of [[], [delegado]] as const) {
    try {
      const t0 = performance.now();
      const m = await loadTensorflowModel(require('../assets/modelos/blaze_face_short_range.tflite'), d as never);
      const carga = ms(t0);
      const entrada = m.inputs[0];
      const n = entrada.shape.reduce((a, b) => a * b, 1);
      const buffer = new Float32Array(n).fill(0.5).buffer;
      m.runSync([buffer]);
      const t1 = performance.now();
      for (let i = 0; i < 20; i++) m.runSync([buffer]);
      const promedio = (performance.now() - t1) / 20;
      partes.push(`${d[0] ?? 'cpu'}: carga ${carga}, ${promedio.toFixed(1)} ms/inferencia, entrada ${entrada.shape.join('x')} ${entrada.dataType}`);
    } catch (e) {
      partes.push(`${d[0] ?? 'cpu'}: ERROR ${String(e).slice(0, 80)}`);
    }
  }
  return partes.join('\n');
}

let whisper: WhisperContext | null = null;
async function contextoWhisper(): Promise<{ ctx: WhisperContext; info: string }> {
  if (whisper) return { ctx: whisper, info: 'modelo ya cargado' };
  const dir = new Directory(Paths.document, 'modelos');
  dir.create({ idempotent: true, intermediates: true });
  const archivo = new File(dir, 'ggml-base-q5_1.bin');
  let info = '';
  if (!archivo.exists) {
    const t = performance.now();
    await File.downloadFileAsync(URL_WHISPER, archivo);
    info = `descarga ${Math.round(archivo.size / 1e6)} MB en ${ms(t)}; `;
  }
  const t = performance.now();
  whisper = await initWhisper({ filePath: archivo.uri, useGpu: true });
  return { ctx: whisper, info: info + `carga ${ms(t)}` };
}

export async function transcribir(origen: string | number): Promise<string> {
  const { ctx, info } = await contextoWhisper();
  const t = performance.now();
  const { promise } = ctx.transcribe(origen, { language: 'es' });
  const { result } = await promise;
  return `${info}; transcripción ${ms(t)}:\n«${result.trim()}»`;
}

export const probarWhisperMuestra = () => transcribir(require('../assets/modelos/muestra-es.wav'));

function claims(jwt: string) {
  const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(globalThis.atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
}

export async function probarLogin(): Promise<string> {
  const t = performance.now();
  const discovery = await AuthSession.fetchDiscoveryAsync(`${KC_URL}/realms/transporte`);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'transporte-chofer', path: 'auth' });
  const req = new AuthSession.AuthRequest({ clientId: 'app-chofer', redirectUri, scopes: ['openid', 'offline_access'], usePKCE: true });
  const res = await req.promptAsync(discovery);
  if (res.type !== 'success') return `login ${res.type}`;
  const tokens = await AuthSession.exchangeCodeAsync(
    { clientId: 'app-chofer', code: res.params.code, redirectUri, extraParams: { code_verifier: req.codeVerifier! } }, discovery);
  const c = claims(tokens.accessToken);
  const r = claims(tokens.refreshToken!);
  const renovado = await AuthSession.refreshAsync({ clientId: 'app-chofer', refreshToken: tokens.refreshToken! }, discovery);
  return `${c.preferred_username} sub=${c.sub}\nroles=${(c.realm_access?.roles ?? []).join(',')} aud=${[c.aud].flat().join(',')}\n` +
    `refresh ${r.typ}; renovación ${renovado.accessToken ? 'ok' : 'falló'}; total ${ms(t)}\nissuer=${c.iss}`;
}

export async function probarPush(): Promise<string> {
  if (Platform.OS === 'ios') return 'iOS con cuenta gratuita: sin push (D45). Se omite sin error.';
  const permiso = await Notifications.requestPermissionsAsync();
  if (permiso.status !== 'granted') return 'sin permiso de notificaciones';
  await Notifications.setNotificationChannelAsync('viajes', { name: 'Viajes', importance: Notifications.AndroidImportance.HIGH });
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    console.log(`TOKEN_FCM ${token.data}`);
    return `token FCM (${token.type}): ${String(token.data).slice(0, 24)}… (${String(token.data).length} car.)`;
  } catch (e) {
    return `sin token FCM: ${String(e).slice(0, 160)}`;
  }
}
