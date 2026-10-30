import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Push al chofer (D45, T7.8): solo Android con FCM (con la cuenta gratuita de Apple no hay push en iPhone). El servidor
 * envía al canal `viajes` (PoC-4: sin canal cae en el de respaldo) con `data.viajeId` para abrir el viaje al tocar.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** El token nativo de FCM para `PUT /dispositivos/mio`; null en iOS o sin permiso. */
export async function tokenPush(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  await Notifications.setNotificationChannelAsync('viajes', {
    name: 'Viajes',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
  const permiso = await Notifications.requestPermissionsAsync();
  if (!permiso.granted) return null;
  try {
    return (await Notifications.getDevicePushTokenAsync()).data as string;
  } catch {
    // Sin google-services.json (build sin Firebase) no hay token: la app sigue sin push.
    return null;
  }
}

/**
 * Llama a `abrir` con el viaje de la notificación que el chofer tocó, también si la app estaba cerrada
 * (`getLastNotificationResponseAsync`, PoC-4), y a `recibida` cuando llega con la app abierta.
 */
export function escucharPush(abrir: (viajeId: string) => void, recibida: () => void): () => void {
  const viajeDe = (r: Notifications.NotificationResponse | null) => r?.notification.request.content.data?.viajeId as string | undefined;
  void Notifications.getLastNotificationResponseAsync().then((r) => {
    const v = viajeDe(r);
    if (v) abrir(v);
  });
  const tocada = Notifications.addNotificationResponseReceivedListener((r) => {
    const v = viajeDe(r);
    if (v) abrir(v);
  });
  const llegada = Notifications.addNotificationReceivedListener(() => recibida());
  return () => {
    tocada.remove();
    llegada.remove();
  };
}
