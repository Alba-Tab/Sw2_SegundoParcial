import { useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Inicio de sesión con Keycloak (PKCE, offline_access, D27). */
export function PantallaSesion({ iniciar, vencida }: { iniciar: () => Promise<void>; vencida: boolean }) {
  const tema = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const entrar = async () => {
    setCargando(true);
    setError(null);
    try {
      await iniciar();
    } catch {
      setError('No se pudo conectar con el servicio de inicio de sesión. Revisa la señal e inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, padding: 24, backgroundColor: tema.colors.background }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tema.colors.primaryContainer,
          }}
        >
          <Icon source="truck-outline" size={40} color={tema.colors.onPrimaryContainer} />
        </View>
        <Text variant="headlineMedium" style={{ marginTop: 8 }}>
          App del chofer
        </Text>
        <Text variant="bodyLarge" style={{ color: tema.colors.onSurfaceVariant }}>
          {vencida
            ? 'Tu sesión venció. Entra de nuevo; lo que guardaste sin señal se envía después.'
            : 'Tus viajes, la bitácora y las entregas, aunque no tengas señal.'}
        </Text>
      </View>
      {error && <HelperText type="error">{error}</HelperText>}
      <Button mode="contained" onPress={() => void entrar()} loading={cargando} disabled={cargando} contentStyle={{ paddingVertical: 10 }}>
        Entrar con mi usuario de chofer
      </Button>
    </SafeAreaView>
  );
}
