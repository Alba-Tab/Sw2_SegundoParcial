import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Appbar, PaperProvider, Snackbar, Text } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migraciones from '../../drizzle/migrations';
import { bd } from '../datos/bd';
import { casos, sesion, viajes } from '../datos/contenedor';
import { viaje } from '../datos/esquema';
import { estadoVisible } from '../dominio/viaje';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { escucharPush, tokenPush } from '../datos/push';
import { registrarTareaFondo } from '../datos/tareaFondo';
import { BarraSincronizacion } from './BarraSincronizacion';
import { PantallaCarga } from './pantallas/PantallaCarga';
import { PantallaEntrega } from './pantallas/PantallaEntrega';
import { PantallaHito } from './pantallas/PantallaHito';
import { PantallaPendientes } from './pantallas/PantallaPendientes';
import { PantallaSesion } from './pantallas/PantallaSesion';
import { PantallaViaje } from './pantallas/PantallaViaje';
import { PantallaViajes } from './pantallas/PantallaViajes';
import { temaClaro, temaOscuro } from './tema';
import { useSincronizacion } from './useSincronizacion';
import { useViajeEnRuta } from './useViajeEnRuta';

type Pantalla = { nombre: 'viajes' } | { nombre: 'pendientes' } | { nombre: 'viaje' | 'hito' | 'entrega' | 'carga'; viajeId: string };

const TITULOS: Record<Pantalla['nombre'], string> = {
  viajes: 'Mis viajes',
  viaje: 'Viaje',
  hito: 'Bitácora',
  entrega: 'Entrega',
  carga: 'Carga de combustible',
  pendientes: 'Pendientes',
};

export function App() {
  const oscuro = useColorScheme() === 'dark';
  const migracion = useMigrations(bd, migraciones);
  return (
    <SafeAreaProvider>
      <PaperProvider theme={oscuro ? temaOscuro : temaClaro}>
        <StatusBar style="auto" />
        {migracion.error ? (
          <Text style={{ padding: 24 }}>No se pudo preparar la base del celular: {migracion.error.message}</Text>
        ) : !migracion.success ? (
          <ActivityIndicator style={{ flex: 1 }} />
        ) : (
          <ConSesion />
        )}
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function ConSesion() {
  const [estado, setEstado] = useState<'cargando' | 'sin-sesion' | 'vencida' | 'activa'>('cargando');
  useEffect(() => {
    void sesion.haySesion().then((hay) => setEstado(hay ? 'activa' : 'sin-sesion'));
  }, []);

  const iniciar = async () => {
    if (!(await sesion.iniciar())) return;
    setEstado('activa');
    // Con señal recién entrado: el celular se registra y baja sus viajes (spec 005, paso 1).
    await Promise.allSettled([tokenPush().then((t) => casos.registrarDispositivo(t)), casos.descargarViajes(), registrarTareaFondo()]);
  };

  if (estado === 'cargando') return <ActivityIndicator style={{ flex: 1 }} />;
  if (estado !== 'activa') return <PantallaSesion iniciar={iniciar} vencida={estado === 'vencida'} />;
  return <Principal alVencerSesion={() => setEstado('vencida')} salir={() => void sesion.cerrar().then(() => setEstado('sin-sesion'))} />;
}

function Principal({ alVencerSesion, salir }: { alVencerSesion: () => void; salir: () => void }) {
  const [pantalla, setPantalla] = useState<Pantalla>({ nombre: 'viajes' });
  const [aviso, setAviso] = useState<string | null>(null);
  const alCancelarse = useCallback(() => setAviso('Viaje cancelado; llama al despachador'), []);
  const sync = useSincronizacion(alCancelarse, alVencerSesion);
  // Con un viaje en ruta (aunque el inicio siga en la cola): GPS y detección de frenadas.
  useLiveQuery(bd.select().from(viaje));
  const enRuta = viajes.todos().find((v) => estadoVisible(v) === 'EN_RUTA')?.viajeId ?? null;
  const alFrenar = useCallback(() => setAviso('Frenada brusca registrada'), []);
  const gps = useViajeEnRuta(enRuta, alFrenar);

  // D45: "Viaje asignado" o "Viaje cancelado" baja los viajes de nuevo; tocar la notificación abre el viaje.
  useEffect(
    () =>
      escucharPush(
        (viajeId) => {
          void casos.descargarViajes().catch(() => {});
          setPantalla({ nombre: 'viaje', viajeId });
        },
        () => void casos.descargarViajes().catch(() => {}),
      ),
    [],
  );

  useEffect(() => {
    const atras = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pantalla.nombre === 'viajes') return false;
      setPantalla(
        'viajeId' in pantalla && pantalla.nombre !== 'viaje' ? { nombre: 'viaje', viajeId: pantalla.viajeId } : { nombre: 'viajes' },
      );
      return true;
    });
    return () => atras.remove();
  }, [pantalla]);

  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header>
        {pantalla.nombre !== 'viajes' && (
          <Appbar.BackAction
            onPress={() => setPantalla(pantalla.nombre === 'hito' ? { nombre: 'viaje', viajeId: pantalla.viajeId } : { nombre: 'viajes' })}
          />
        )}
        <Appbar.Content title={TITULOS[pantalla.nombre]} />
        <Appbar.Action icon="sync" accessibilityLabel="Sincronizar ahora" onPress={() => void sync.sincronizar()} />
        <Appbar.Action icon="logout" accessibilityLabel="Cerrar sesión" onPress={salir} />
      </Appbar.Header>
      <BarraSincronizacion {...sync} verPendientes={() => setPantalla({ nombre: 'pendientes' })} />
      {pantalla.nombre === 'viajes' && (
        <PantallaViajes enLinea={sync.enLinea} abrir={(viajeId) => setPantalla({ nombre: 'viaje', viajeId })} />
      )}
      {pantalla.nombre === 'viaje' && (
        <PantallaViaje
          viajeId={pantalla.viajeId}
          gps={gps}
          sincronizar={() => void sync.sincronizar()}
          abrir={(nombre) => setPantalla({ nombre, viajeId: pantalla.viajeId })}
        />
      )}
      {pantalla.nombre === 'hito' && (
        <PantallaHito
          viajeId={pantalla.viajeId}
          alGuardar={() => {
            setAviso('Hito guardado; se envía con la señal');
            setPantalla({ nombre: 'viaje', viajeId: pantalla.viajeId });
            void sync.sincronizar();
          }}
        />
      )}
      {pantalla.nombre === 'entrega' && (
        <PantallaEntrega
          viajeId={pantalla.viajeId}
          alGuardar={(mensaje) => {
            setAviso(mensaje);
            setPantalla({ nombre: 'viaje', viajeId: pantalla.viajeId });
            void sync.sincronizar();
          }}
        />
      )}
      {pantalla.nombre === 'carga' && (
        <PantallaCarga
          viajeId={pantalla.viajeId}
          alGuardar={() => {
            setAviso('Carga registrada; se envía con la señal');
            setPantalla({ nombre: 'viaje', viajeId: pantalla.viajeId });
            void sync.sincronizar();
          }}
        />
      )}
      {pantalla.nombre === 'pendientes' && <PantallaPendientes />}
      <Snackbar visible={aviso !== null} onDismiss={() => setAviso(null)} duration={8000}>
        {aviso ?? ''}
      </Snackbar>
    </View>
  );
}
