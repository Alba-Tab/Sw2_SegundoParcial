import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * APP_ENTORNO elige a qué servicios habla la app: `local` (compose en la Mac, por <mac>.local; el celular y el simulador
 * de iOS resuelven mDNS) o `nube` (F11). Las URL viajan en `extra` y las lee src/configuracion.ts.
 */
const entorno = process.env.APP_ENTORNO ?? 'local';
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
    package: 'bo.transporte.chofer',
    adaptiveIcon: {
      backgroundColor: '#3c6090',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['POST_NOTIFICATIONS'],
    predictiveBackGestureEnabled: false,
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
    ['expo-sensors', { motionPermission: 'Para detectar frenadas bruscas durante el viaje.' }],
    ['expo-build-properties', { android: { usesCleartextTraffic: entorno === 'local' } }],
  ],
});
