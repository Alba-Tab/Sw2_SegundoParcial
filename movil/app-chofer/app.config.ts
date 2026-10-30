import { existsSync, readFileSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * APP_ENTORNO elige a qué servicios habla la app: `local` (compose en la Mac, por <mac>.local; el celular y el simulador
 * de iOS resuelven mDNS) o `nube` (F11). Las URL viajan en `extra` y las lee src/configuracion.ts.
 */
const entorno = process.env.APP_ENTORNO ?? 'local';
/** El paquete de Android; APP_ANDROID_PACKAGE permite probar con otra app ya registrada en Firebase. */
const paqueteAndroid = process.env.APP_ANDROID_PACKAGE ?? 'bo.transporte.chofer';

/**
 * D45: google-services.json no se versiona; se genera en el build desde un secreto (o se copia en local). Solo se usa si
 * Firebase tiene registrada esta app; si no, la app compila sin push.
 */
function firebaseAndroid(): string | null {
  const archivo = process.env.APP_GOOGLE_SERVICES ?? './google-services.json';
  if (!existsSync(archivo)) return null;
  const config = JSON.parse(readFileSync(archivo, 'utf8')) as {
    client?: { client_info?: { android_client_info?: { package_name?: string } } }[];
  };
  const registrada = config.client?.some((c) => c.client_info?.android_client_info?.package_name === paqueteAndroid);
  if (!registrada) console.warn(`google-services.json no tiene la app ${paqueteAndroid}: el build de Android va sin push.`);
  return registrada ? archivo : null;
}
const firebase = firebaseAndroid();
const mac = process.env.APP_MAC_LOCAL ?? 'mac.local';
const servicios =
  entorno === 'nube'
    ? {
        viajesUrl: process.env.APP_VIAJES_URL ?? '',
        flotaUrl: process.env.APP_FLOTA_URL ?? '',
        oidcIssuer: process.env.APP_OIDC_ISSUER ?? '',
      }
    : {
        viajesUrl: `http://${mac}:8101`,
        flotaUrl: `http://${mac}:8102`,
        oidcIssuer: `http://${mac}:8080/realms/transporte`,
      };

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Chofer',
  slug: 'app-chofer',
  version: '0.1.0',
  scheme: 'transporte-chofer',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  extra: { entorno, ...servicios },
  ios: {
    bundleIdentifier: 'bo.transporte.chofer',
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location', 'fetch', 'processing'],
      // Local: los servicios de la Mac por HTTP en la red local (PoC-4).
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      NSLocalNetworkUsageDescription: 'Para conectarse a los servicios del sistema en la red local.',
    },
  },
  android: {
    package: paqueteAndroid,
    adaptiveIcon: {
      backgroundColor: '#3c6090',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['POST_NOTIFICATIONS'],
    predictiveBackGestureEnabled: false,
    ...(firebase ? { googleServicesFile: firebase } : {}),
  },
  plugins: [
    'expo-sqlite',
    'expo-secure-store',
    'expo-web-browser',
    'expo-background-task',
    'expo-status-bar',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Para registrar la posición del viaje.',
        locationAlwaysAndWhenInUsePermission: 'Para registrar la posición del viaje aunque la app esté en segundo plano.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-audio', { microphonePermission: 'Para dictar la bitácora del viaje; el audio no sale del celular.' }],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Para fotografiar la entrega y los recibos, y para el detector de fatiga (las imágenes no salen del celular).',
        photosPermission: 'Para elegir la foto de la entrega o del recibo.',
      },
    ],
    ['expo-notifications', { defaultChannel: 'viajes' }],
    ['expo-sensors', { motionPermission: 'Para detectar frenadas bruscas durante el viaje.' }],
    ['expo-build-properties', { android: { usesCleartextTraffic: entorno === 'local' } }],
  ],
});
