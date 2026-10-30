import { useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

/** Inicio de sesión con Keycloak (PKCE, offline_access, D27). */
export function PantallaSesion({ iniciar, vencida }: { iniciar: () => Promise<void>; vencida: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const entrar = async () => {
    setCargando(true);
    setError(null);
    try {
      await iniciar();
    } catch {
      setError('No se pudo conectar con el servicio de inicio de sesión.');
    } finally {
      setCargando(false);
    }
  };
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text variant="headlineSmall">Transporte de carga</Text>
      <Text variant="bodyLarge">
        {vencida ? 'Tu sesión venció. Entra de nuevo; los registros guardados se envían después.' : 'Entra con tu usuario de chofer.'}
      </Text>
      {error && <Text variant="bodyMedium">{error}</Text>}
      <Button mode="contained" onPress={entrar} loading={cargando} contentStyle={{ paddingVertical: 8 }}>
        Iniciar sesión
      </Button>
    </View>
  );
}
