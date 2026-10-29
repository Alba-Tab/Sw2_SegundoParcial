// Muestra la notificación también con la app abierta y deja en el log cuándo llega y cuándo se toca (D45).
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
Notifications.addNotificationReceivedListener((n) =>
  console.log(`PUSH_RECIBIDO ${n.request.content.title} | ${n.request.content.body} | ${JSON.stringify(n.request.content.data)}`));
Notifications.addNotificationResponseReceivedListener((r) =>
  console.log(`PUSH_TOCADO ${r.notification.request.content.title} | ${JSON.stringify(r.notification.request.content.data)}`));
