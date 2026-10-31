import { FlatList, StyleSheet, View } from 'react-native';
import { Button, Icon, List, Text, useTheme } from 'react-native-paper';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { bd } from '../../datos/bd';
import { cola } from '../../datos/contenedor';
import { operacionPendiente } from '../../datos/esquema';
import { OPERACIONES, plural } from '../textos';

const ESTADOS = {
  PENDIENTE: 'Por enviar',
  FALLIDA: 'No se pudo enviar',
  DESCARTADA: 'Descartada (viaje cancelado)',
  CONFIRMADA: 'Enviada',
};

/** Los códigos de 000 §5 que le pueden llegar al chofer, en palabras suyas; el código queda al final para el despachador. */
const MOTIVOS: Record<string, string> = {
  VALIDACION: 'Faltan datos o no son válidos',
  CONFLICTO_ESTADO: 'El viaje cambió de estado',
  NO_ENCONTRADO: 'El viaje ya no existe',
  SIN_PERMISO: 'Este viaje no es tuyo',
  EVIDENCIA_INCOMPLETA: 'Faltan fotos en el servidor',
  EVIDENCIA_PERDIDA: 'La foto ya no está en el celular',
  CARGA_EXCEDE_TANQUE: 'Los litros superan el tanque',
  KILOMETRAJE_INVALIDO: 'El kilometraje es menor que el anterior',
  IDEMPOTENCIA_CUERPO_DISTINTO: 'Ya se envió un registro distinto con la misma clave',
};

/** "Pendientes con error" y "Descartadas" (D54): lo que no se envió y por qué, con su código de 000 §5. */
export function PantallaPendientes({ sincronizar, enviando }: { sincronizar: () => void; enviando: boolean }) {
  const tema = useTheme();
  useLiveQuery(bd.select().from(operacionPendiente));
  const ops = cola.visibles();
  return (
    <FlatList
      data={ops}
      keyExtractor={(o) => o.opId}
      contentContainerStyle={ops.length ? undefined : { flexGrow: 1 }}
      ListHeaderComponent={
        ops.some((o) => o.estado === 'PENDIENTE') ? (
          <Button
            mode="contained-tonal"
            icon="cloud-upload-outline"
            onPress={sincronizar}
            loading={enviando}
            disabled={enviando}
            style={{ margin: 16 }}
          >
            Enviar ahora
          </Button>
        ) : null
      }
      ListEmptyComponent={
        <View style={estilos.vacio}>
          <Icon source="cloud-check-outline" size={48} />
          <Text variant="titleMedium">Todo enviado</Text>
          <Text variant="bodyMedium">No hay registros esperando señal ni con error.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <List.Item
          title={OPERACIONES[item.tipo] ?? item.tipo}
          titleStyle={{ fontWeight: '600' }}
          descriptionNumberOfLines={3}
          description={[
            ESTADOS[item.estado],
            item.codigoError ? `${MOTIVOS[item.codigoError] ?? 'Rechazado por el servidor'} (${item.codigoError})` : null,
            new Date(item.creadaEn).toLocaleString(),
            item.intentos ? plural(item.intentos, 'intento', 'intentos') : null,
            item.estado === 'FALLIDA' ? 'Avisa al despachador' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          left={(p) => (
            <List.Icon
              {...p}
              color={item.estado === 'FALLIDA' ? tema.colors.error : p.color}
              icon={item.estado === 'FALLIDA' ? 'alert-circle' : item.estado === 'DESCARTADA' ? 'cancel' : 'clock-outline'}
            />
          )}
        />
      )}
    />
  );
}

const estilos = StyleSheet.create({
  vacio: { flex: 1, padding: 24, gap: 12, justifyContent: 'center', alignItems: 'center' },
});
