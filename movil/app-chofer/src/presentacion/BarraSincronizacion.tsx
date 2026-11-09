import { useState } from 'react';
import { View } from 'react-native';
import { Button, Icon, IconButton, Text, useTheme } from 'react-native-paper';

/**
 * Lo que el chofer ve del motor: "Sin conexión · N por enviar" o "N por enviar"; con todo enviado no ocupa lugar (el
 * ícono de la barra de arriba ya lo dice). El *throttling* y los reintentos no se muestran como error (FO4); solo las
 * operaciones FALLIDA (otro 4xx), con un acceso a la lista.
 */
export function BarraSincronizacion({
  enLinea,
  pendientes,
  puntos,
  conError,
  verPendientes,
  enPendientes,
}: {
  enLinea: boolean;
  pendientes: number;
  puntos: number;
  conError: number;
  verPendientes: () => void;
  /** En la lista de pendientes el aviso sobra: la lista ya muestra lo que falló. */
  enPendientes: boolean;
}) {
  const tema = useTheme();
  const total = pendientes + puntos;
  // Cerrarlo lo oculta; vuelve a salir solo si aparecen más registros con error.
  const [vistas, setVistas] = useState(0);
  const texto = enLinea ? `${total} por enviar` : `Sin conexión · ${total} por enviar; se envían solos con señal`;
  return (
    <>
      {(total > 0 || !enLinea) && (
        <Text variant="labelLarge" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
          {texto}
        </Text>
      )}
      {conError > vistas && !enPendientes && (
        // Una fila, no un banner: queda en todas las pantallas (Fatiga incluida) y no debe comerse la pantalla.
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 16,
            backgroundColor: tema.colors.errorContainer,
          }}
        >
          <Icon source="alert-circle" size={20} color={tema.colors.onErrorContainer} />
          <Text variant="labelLarge" style={{ flex: 1, color: tema.colors.onErrorContainer }}>
            {`${conError} ${conError === 1 ? 'registro no se pudo enviar' : 'registros no se pudieron enviar'}`}
          </Text>
          <Button compact textColor={tema.colors.onErrorContainer} onPress={verPendientes}>
            Ver
          </Button>
          <IconButton
            icon="close"
            size={20}
            iconColor={tema.colors.onErrorContainer}
            accessibilityLabel="Cerrar el aviso"
            onPress={() => setVistas(conError)}
          />
        </View>
      )}
    </>
  );
}
