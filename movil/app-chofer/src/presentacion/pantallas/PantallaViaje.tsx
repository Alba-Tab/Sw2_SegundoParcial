import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Banner, Button, Card, Text } from 'react-native-paper';
import { estadoVisible, puedeIniciar } from '../../dominio/viaje';
import { bd } from '../../datos/bd';
import { casos, viajes } from '../../datos/contenedor';
import { viaje } from '../../datos/esquema';
import { CARGAS, ESTADOS } from '../textos';

/** Spec 005, paso 2: "Iniciar viaje" va a la cola con su opId y la hora del celular; funciona sin señal. */
export function PantallaViaje({ viajeId, sincronizar }: { viajeId: string; sincronizar: () => void }) {
  useLiveQuery(bd.select().from(viaje));
  const v = viajes.porId(viajeId);
  const [error, setError] = useState<string | null>(null);
  if (!v) return <Text style={{ padding: 16 }}>El viaje ya no está en este celular.</Text>;
  const estado = estadoVisible(v);

  const iniciar = () => {
    try {
      // La posición del inicio llega con el GPS (T7.3).
      casos.iniciarViaje(viajeId, null);
      sincronizar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Banner visible={v.canceladoAlSincronizar} icon="phone-alert">
        Viaje cancelado; llama al despachador.
      </Banner>
      <Card>
        <Card.Title title={v.ruta} subtitle={ESTADOS[estado]} />
        <Card.Content style={{ gap: 4 }}>
          <Text variant="bodyLarge">{v.cliente}</Text>
          <Text variant="bodyMedium">
            {CARGAS[v.tipoCarga] ?? v.tipoCarga} · {v.toneladas} t · {v.fechaViaje}
          </Text>
          <Text variant="bodyMedium">Unidad {v.placa}</Text>
          <Text variant="bodySmall">Geocerca del destino: {v.destino.radioMetros} m</Text>
        </Card.Content>
      </Card>
      {v.iniciadoLocal && estado === 'EN_RUTA' && v.estado === 'CONFIRMADO' && (
        <Text variant="bodyMedium">Inicio registrado en el celular; se envía al recuperar la señal.</Text>
      )}
      {error && <Text variant="bodyMedium">{error}</Text>}
      {puedeIniciar(v, viajes.todos()) && (
        <Button mode="contained" icon="truck-fast" onPress={iniciar} contentStyle={{ paddingVertical: 8 }}>
          Iniciar viaje
        </Button>
      )}
    </ScrollView>
  );
}
