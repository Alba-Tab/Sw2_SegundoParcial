import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import { estadoVisible, type ViajeLocal } from '../../dominio/viaje';
import { bd } from '../../datos/bd';
import { casos, viajes } from '../../datos/contenedor';
import { viaje } from '../../datos/esquema';
import { CARGAS, ESTADOS } from '../textos';

/** Paso 1: los viajes descargados (activos y los terminados en 7 días, D50). Funciona sin red desde SQLite. */
export function PantallaViajes({ abrir, enLinea }: { abrir: (viajeId: string) => void; enLinea: boolean }) {
  useLiveQuery(bd.select().from(viaje));
  const lista = viajes.todos().sort((a, b) => a.fechaViaje.localeCompare(b.fechaViaje));
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actualizar = async () => {
    setActualizando(true);
    setError(null);
    try {
      await casos.descargarViajes();
    } catch {
      setError(enLinea ? 'No se pudo actualizar' : 'Sin conexión: se muestran los viajes guardados');
    } finally {
      setActualizando(false);
    }
  };

  return (
    <FlatList
      data={lista}
      keyExtractor={(v) => v.viajeId}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={actualizando} onRefresh={actualizar} />}
      ListHeaderComponent={error ? <Text variant="bodyMedium">{error}</Text> : null}
      ListEmptyComponent={<Text variant="bodyLarge">No tienes viajes asignados. Desliza hacia abajo para actualizar.</Text>}
      renderItem={({ item }) => <TarjetaViaje v={item} alTocar={() => abrir(item.viajeId)} />}
    />
  );
}

function TarjetaViaje({ v, alTocar }: { v: ViajeLocal; alTocar: () => void }) {
  const estado = estadoVisible(v);
  return (
    <Card onPress={alTocar} accessibilityHint="Abre el viaje">
      <Card.Title
        title={v.ruta}
        subtitle={`${v.cliente} · ${v.fechaViaje}`}
        right={() => <Chip style={{ marginRight: 12 }}>{ESTADOS[estado]}</Chip>}
      />
      <Card.Content>
        <Text variant="bodyMedium">
          {CARGAS[v.tipoCarga] ?? v.tipoCarga} · {v.toneladas} t · {v.placa}
        </Text>
      </Card.Content>
    </Card>
  );
}
