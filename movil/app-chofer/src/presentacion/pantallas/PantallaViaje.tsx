import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Banner, Button, Card, Text } from 'react-native-paper';
import { estadoVisible, puedeIniciar } from '../../dominio/viaje';
import { bd } from '../../datos/bd';
import { casos, puntos, viajes } from '../../datos/contenedor';
import { type EstadoGps, posicionActual } from '../../datos/gps';
import { puntoGps, viaje } from '../../datos/esquema';
import { CARGAS, ESTADOS } from '../textos';

/** Spec 005, paso 2: "Iniciar viaje" va a la cola con su opId y la hora del celular; funciona sin señal. */
const GPS: Record<EstadoGps, string> = {
  activo: 'GPS activo',
  'sin-permiso': 'Sin permiso de ubicación: actívalo en Ajustes',
  'sin-permiso-fondo': 'Permite la ubicación "Siempre" para registrar el viaje con la pantalla apagada',
  detenido: 'GPS detenido',
};

export function PantallaViaje({
  viajeId,
  gps,
  sincronizar,
  abrirHito,
}: {
  viajeId: string;
  gps: EstadoGps;
  sincronizar: () => void;
  abrirHito: () => void;
}) {
  useLiveQuery(bd.select().from(viaje));
  useLiveQuery(bd.select().from(puntoGps));
  const v = viajes.porId(viajeId);
  const [error, setError] = useState<string | null>(null);
  if (!v) return <Text style={{ padding: 16 }}>El viaje ya no está en este celular.</Text>;
  const estado = estadoVisible(v);

  const iniciar = async () => {
    try {
      casos.iniciarViaje(viajeId, await posicionActual());
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
      {estado === 'EN_RUTA' && (
        <Text variant="bodyMedium">
          {GPS[gps]} · {puntos.pendientes(viajeId, 10_000).length} puntos por enviar
        </Text>
      )}
      {estado === 'EN_RUTA' && (
        <Button mode="contained-tonal" icon="notebook-edit" onPress={abrirHito} contentStyle={{ paddingVertical: 8 }}>
          Registrar hito
        </Button>
      )}
      {error && <Text variant="bodyMedium">{error}</Text>}
      {puedeIniciar(v, viajes.todos()) && (
        <Button mode="contained" icon="truck-fast" onPress={() => void iniciar()} contentStyle={{ paddingVertical: 8 }}>
          Iniciar viaje
        </Button>
      )}
    </ScrollView>
  );
}
