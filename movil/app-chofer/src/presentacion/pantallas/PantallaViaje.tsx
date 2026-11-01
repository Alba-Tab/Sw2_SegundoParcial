import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, HelperText, Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { estadoVisible, puedeIniciar } from '../../dominio/viaje';
import { bd } from '../../datos/bd';
import { casos, cola, viajes } from '../../datos/contenedor';
import { type EstadoGps, posicionActual } from '../../datos/gps';
import { operacionPendiente, puntoGps, viaje } from '../../datos/esquema';
import { mensajeDe } from '../errores';
import { CARGAS, ESTADOS, fechaCorta } from '../textos';

/** Spec 005, paso 2: "Iniciar viaje" va a la cola con su opId y la hora del celular; funciona sin señal. */
const GPS: Record<EstadoGps, { texto: string; icono: string; bien: boolean }> = {
  activo: { texto: 'GPS activo', icono: 'crosshairs-gps', bien: true },
  'sin-permiso': { texto: 'Sin permiso de ubicación: actívalo en Ajustes', icono: 'crosshairs-off', bien: false },
  'sin-permiso-fondo': {
    texto: 'Permite la ubicación "Siempre" para registrar el viaje con la pantalla apagada',
    icono: 'crosshairs-question',
    bien: false,
  },
  detenido: { texto: 'GPS detenido: revisa que la ubicación esté activa', icono: 'crosshairs-off', bien: false },
};

type Accion = 'hito' | 'entrega' | 'carga' | 'fatiga';

export function PantallaViaje({
  viajeId,
  gps,
  sincronizar,
  abrir,
  volver,
  verPendientes,
}: {
  viajeId: string;
  gps: EstadoGps;
  sincronizar: () => void;
  abrir: (pantalla: Accion) => void;
  volver: () => void;
  verPendientes: () => void;
}) {
  const tema = useTheme();
  useLiveQuery(bd.select().from(viaje));
  // Solo el conteo del viaje: leer la tabla entera con cada punto nuevo era un render caro por punto.
  const porEnviar =
    useLiveQuery(
      bd
        .select({ n: sql<number>`count(*)` })
        .from(puntoGps)
        .where(eq(puntoGps.viajeId, viajeId)),
    ).data[0]?.n ?? 0;
  useLiveQuery(bd.select({ estado: operacionPendiente.estado }).from(operacionPendiente));
  const v = viajes.porId(viajeId);
  const [error, setError] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  // Cerrojo: un segundo toque antes del re-render chocaba con el primero y mostraba un error falso.
  const cerrojo = useRef(false);
  if (!v) {
    return (
      <View style={estilos.vacio}>
        <Icon source="truck-remove-outline" size={48} />
        <Text variant="titleMedium">Este viaje ya no está en el celular</Text>
        <Text variant="bodyMedium">Puede que lo hayan cancelado o reasignado.</Text>
        <Button mode="contained" icon="format-list-bulleted" onPress={volver}>
          Ver mis viajes
        </Button>
      </View>
    );
  }
  const estado = estadoVisible(v);
  const enRuta = estado === 'EN_RUTA';
  const entregaRegistrada = v.entregaLocal && (v.estado === 'EN_RUTA' || v.estado === 'CONFIRMADO');
  // Un inicio, entrega o rechazo que el servidor rechazó ya no se envía «con la señal»: se dice y se da la salida.
  const rechazada = cola
    .visibles()
    .find((o) => o.viajeId === viajeId && o.estado === 'FALLIDA' && ['INICIO', 'ENTREGA', 'RECHAZO'].includes(o.tipo));

  const iniciar = async () => {
    if (cerrojo.current) return;
    cerrojo.current = true;
    setError(null);
    setIniciando(true);
    try {
      casos.iniciarViaje(viajeId, await posicionActual());
      sincronizar();
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo iniciar el viaje. Inténtalo de nuevo.'));
    } finally {
      cerrojo.current = false;
      setIniciando(false);
    }
  };

  const tarjeta = (accion: Accion, icono: string, texto: string, principal = false) => (
    <Card
      key={accion}
      mode={principal ? 'contained' : 'elevated'}
      style={[estilos.accion, principal && { backgroundColor: tema.colors.primaryContainer }]}
    >
      <TouchableRipple onPress={() => abrir(accion)} accessibilityRole="button" style={estilos.toque} borderless>
        <View style={estilos.contenidoAccion}>
          <Icon source={icono} size={36} color={principal ? tema.colors.onPrimaryContainer : tema.colors.primary} />
          <Text variant="titleMedium" style={{ color: principal ? tema.colors.onPrimaryContainer : tema.colors.onSurface }}>
            {texto}
          </Text>
        </View>
      </TouchableRipple>
    </Card>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Banner visible={v.canceladoAlSincronizar} icon="phone-alert">
        Viaje cancelado; llama al despachador.
      </Banner>
      <Card>
        <Card.Title title={v.ruta} titleVariant="titleLarge" subtitle={ESTADOS[estado]} titleNumberOfLines={2} />
        <Card.Content style={{ gap: 4 }}>
          <Text variant="bodyLarge">{v.cliente}</Text>
          <Text variant="bodyMedium">
            {CARGAS[v.tipoCarga] ?? v.tipoCarga} · {v.toneladas} t · {fechaCorta(v.fechaViaje)}
          </Text>
          <Text variant="bodyMedium">Unidad {v.placa}</Text>
        </Card.Content>
      </Card>
      {rechazada && (
        <Banner visible icon="alert-circle-outline" actions={[{ label: 'Ver pendientes', onPress: verPendientes }]}>
          {rechazada.tipo === 'INICIO' ? 'El inicio' : rechazada.tipo === 'ENTREGA' ? 'La entrega' : 'El rechazo'} no se pudo enviar. Avisa
          al despachador.
        </Banner>
      )}
      {entregaRegistrada && !rechazada && (
        <Text variant="bodyMedium">
          {v.entregaLocal === 'ENTREGA' ? 'Entrega registrada' : 'Rechazo registrado'} en el celular; se envía con las fotos al recuperar la
          señal.
        </Text>
      )}
      {v.iniciadoLocal && enRuta && v.estado === 'CONFIRMADO' && !rechazada && (
        <Text variant="bodyMedium">Inicio registrado en el celular; se envía al recuperar la señal.</Text>
      )}
      {enRuta && (
        <View style={estilos.gps} accessibilityLiveRegion="polite">
          <Icon source={GPS[gps].icono} size={20} color={GPS[gps].bien ? tema.colors.primary : tema.colors.error} />
          <Text variant="bodyMedium" style={{ flex: 1, color: GPS[gps].bien ? tema.colors.onSurface : tema.colors.error }}>
            {GPS[gps].texto}
            {GPS[gps].bien ? ` · ${porEnviar} puntos por enviar` : ''}
          </Text>
          {!GPS[gps].bien && gps !== 'detenido' && (
            <Button compact onPress={() => void Linking.openSettings()} accessibilityHint="Abre los ajustes de la app">
              Ajustes
            </Button>
          )}
        </View>
      )}
      {enRuta && (
        <View style={{ gap: 12 }}>
          <View style={estilos.fila}>
            {tarjeta('entrega', 'package-variant-closed-check', 'Entregar', true)}
            {tarjeta('hito', 'notebook-edit-outline', 'Bitácora')}
          </View>
          <View style={estilos.fila}>
            {tarjeta('carga', 'gas-station-outline', 'Combustible')}
            {tarjeta('fatiga', 'eye-outline', 'Fatiga')}
          </View>
        </View>
      )}
      {error && <HelperText type="error">{error}</HelperText>}
      {estado === 'CONFIRMADO' && !puedeIniciar(v, viajes.todos()) && (
        <HelperText type="info">Termina el viaje en ruta para iniciar este.</HelperText>
      )}
      {puedeIniciar(v, viajes.todos()) && (
        <Button
          mode="contained"
          icon="truck-fast"
          onPress={() => void iniciar()}
          loading={iniciando}
          disabled={iniciando}
          contentStyle={{ paddingVertical: 10 }}
          labelStyle={{ fontSize: 18 }}
        >
          Iniciar viaje
        </Button>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  vacio: { flex: 1, padding: 24, gap: 12, justifyContent: 'center', alignItems: 'center' },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fila: { flexDirection: 'row', gap: 12 },
  accion: { flex: 1 },
  toque: { borderRadius: 12 },
  contenidoAccion: { minHeight: 112, padding: 16, gap: 10, justifyContent: 'center', alignItems: 'center' },
});
