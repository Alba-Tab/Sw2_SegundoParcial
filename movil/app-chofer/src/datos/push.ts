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

/** Notificaciones ya atendidas en esta ejecución: el listener y la última respuesta pueden traer la misma. */
const atendidas = new Set<string>();

/**
 * Llama a `abrir` con el viaje de la notificación que el chofer tocó, también si la app estaba cerrada
 * (`getLastNotificationResponse`, PoC-4), a `recibida` cuando llega con la app abierta y a `tokenNuevo` cuando FCM rota
 * el token (hay que volver a registrarlo con `PUT /dispositivos/mio`). La última respuesta se borra al atenderla: volver
 * a montar la pantalla (otra sesión, la sesión vencida) no reabre el mismo viaje.
 */
export function escucharPush(abrir: (viajeId: string) => void, recibida: () => void, tokenNuevo: (token: string) => void): () => void {
  const atender = (r: Notifications.NotificationResponse | null) => {
    if (!r || atendidas.has(r.notification.request.identifier)) return;
    atendidas.add(r.notification.request.identifier);
    Notifications.clearLastNotificationResponse();
    const viajeId = r.notification.request.content.data?.viajeId;
    if (typeof viajeId === 'string') abrir(viajeId);
  };
  try {
    atender(Notifications.getLastNotificationResponse());
  } catch {
    // Sin el módulo nativo (build sin notificaciones) no hay respuesta que atender.
  }
  const tocada = Notifications.addNotificationResponseReceivedListener(atender);
  const llegada = Notifications.addNotificationReceivedListener(() => recibida());
  const rotado = Notifications.addPushTokenListener((t) => {
    if (Platform.OS === 'android' && typeof t.data === 'string') tokenNuevo(t.data);
  });
  return () => {
    tocada.remove();
    llegada.remove();
    rotado.remove();
  };
}
