import { FlatList } from 'react-native';
import { List, Text } from 'react-native-paper';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { bd } from '../../datos/bd';
import { cola } from '../../datos/contenedor';
import { operacionPendiente } from '../../datos/esquema';
import { OPERACIONES } from '../textos';

const ESTADOS = {
  PENDIENTE: 'Por enviar',
  FALLIDA: 'No se pudo enviar',
  DESCARTADA: 'Descartada (viaje cancelado)',
  CONFIRMADA: 'Enviada',
};

/** "Pendientes con error" y "Descartadas" (D54): lo que no se envió y por qué, con su código de 000 §5. */
export function PantallaPendientes() {
  useLiveQuery(bd.select().from(operacionPendiente));
  const ops = cola.visibles();
  return (
    <FlatList
      data={ops}
      keyExtractor={(o) => o.opId}
      ListEmptyComponent={<Text style={{ padding: 16 }}>No hay registros pendientes.</Text>}
      renderItem={({ item }) => (
        <List.Item
          title={OPERACIONES[item.tipo] ?? item.tipo}
          description={`${ESTADOS[item.estado]}${item.codigoError ? ` · ${item.codigoError}` : ''} · ${new Date(item.creadaEn).toLocaleString()}${item.intentos ? ` · ${item.intentos} intentos` : ''}`}
          left={(p) => (
            <List.Icon
              {...p}
              icon={item.estado === 'FALLIDA' ? 'alert-circle' : item.estado === 'DESCARTADA' ? 'cancel' : 'clock-outline'}
            />
          )}
        />
      )}
    />
  );
}
