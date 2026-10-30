import { Banner, Text } from 'react-native-paper';

/**
 * Lo que el chofer ve del motor: "Sin conexión · N pendientes" o "Pendientes: N". El *throttling* y los reintentos no
 * se muestran como error (FO4); solo las operaciones FALLIDA (otro 4xx), con un acceso a la lista.
 */
export function BarraSincronizacion({
  enLinea,
  pendientes,
  puntos,
  conError,
  verPendientes,
}: {
  enLinea: boolean;
  pendientes: number;
  puntos: number;
  conError: number;
  verPendientes: () => void;
}) {
  const total = pendientes + puntos;
  const texto = enLinea ? (total ? `Pendientes: ${total}` : 'Todo enviado') : `Sin conexión · ${total} pendientes`;
  return (
    <>
      <Text variant="labelLarge" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        {texto}
      </Text>
      <Banner visible={conError > 0} actions={[{ label: 'Ver', onPress: verPendientes }]} icon="alert-circle-outline">
        {`${conError} ${conError === 1 ? 'registro no se pudo enviar' : 'registros no se pudieron enviar'}`}
      </Banner>
    </>
  );
}
