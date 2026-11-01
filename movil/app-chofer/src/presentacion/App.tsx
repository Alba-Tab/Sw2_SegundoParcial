import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Dialog, Menu, PaperProvider, Portal, Snackbar, Text } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migraciones from '../../drizzle/migrations';
import type { SinEnviar } from '../aplicacion/cierreSesion';
import { bd } from '../datos/bd';
import { cierre } from '../datos/cierre';
import { casos, cola, puntos, sesion, viajes } from '../datos/contenedor';
import { viaje } from '../datos/esquema';
import { estadoVisible } from '../dominio/viaje';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { escucharPush, tokenPush } from '../datos/push';
import { registrarTareaFondo } from '../datos/tareaFondo';
import { BarraSincronizacion } from './BarraSincronizacion';
import { PantallaCarga } from './pantallas/PantallaCarga';
import { PantallaFatiga } from './pantallas/PantallaFatiga';
import { PantallaEntrega } from './pantallas/PantallaEntrega';
import { PantallaHito } from './pantallas/PantallaHito';
import { PantallaPendientes } from './pantallas/PantallaPendientes';
import { PantallaSesion } from './pantallas/PantallaSesion';
import { PantallaViaje } from './pantallas/PantallaViaje';
import { PantallaViajes } from './pantallas/PantallaViajes';
import { temaClaro, temaOscuro } from './tema';
import { plural } from './textos';
import { useSincronizacion } from './useSincronizacion';
import { useViajeEnRuta } from './useViajeEnRuta';

type PantallaBase = { nombre: 'viajes' } | { nombre: 'viaje' | 'hito' | 'entrega' | 'carga' | 'fatiga'; viajeId: string };
/** Pendientes se abre desde cualquier pantalla y vuelve a la que estaba. */
type Pantalla = PantallaBase | { nombre: 'pendientes'; volverA: PantallaBase };

const TITULOS: Record<Pantalla['nombre'], string> = {
  viajes: 'Mis viajes',
  viaje: 'Viaje',
  hito: 'Bitácora',
  entrega: 'Entrega',
  carga: 'Combustible',
  fatiga: 'Fatiga',
  pendientes: 'Pendientes',
};

export function App() {
  const oscuro = useColorScheme() === 'dark';
  const migracion = useMigrations(bd, migraciones);
  // La fuente de los íconos se carga antes del primer render: sin ella los botones salen vacíos un instante.
  const [fuentes, errorFuentes] = useFonts(MaterialCommunityIcons.font);
  if (migracion.error) console.error(migracion.error);
  return (
    <SafeAreaProvider>
      <PaperProvider theme={oscuro ? temaOscuro : temaClaro}>
        <StatusBar style="auto" />
        {migracion.error ? (
          <Text variant="bodyLarge" style={{ padding: 24 }}>
            No se pudo preparar el celular. Cierra la app y ábrela de nuevo; si sigue, avisa al despachador.
          </Text>
        ) : !migracion.success || !(fuentes || errorFuentes) ? (
          <ActivityIndicator style={{ flex: 1 }} />
        ) : (
          <ConSesion />
        )}
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function ConSesion() {
  const [estado, setEstado] = useState<'cargando' | 'sin-sesion' | 'vencida' | 'activa' | 'saliendo'>('cargando');
  useEffect(() => {
    void sesion
      .haySesion()
      .then((hay) => setEstado(hay ? 'activa' : 'sin-sesion'))
      .catch(() => setEstado('sin-sesion'));
  }, []);

  const iniciar = async () => {
    if (!(await sesion.iniciar())) return;
    setEstado('activa');
    // Con señal recién entrado: el celular se registra y baja sus viajes (spec 005, paso 1).
    await Promise.allSettled([tokenPush().then((t) => casos.registrarDispositivo(t)), casos.descargarViajes(), registrarTareaFondo()]);
  };

  // Cerrar sesión: GPS detenido, refresh token revocado y los datos del chofer borrados del celular (spec 005).
  const salir = () => {
    setEstado('saliendo');
    void cierre
      .salir()
      .catch(() => {})
      .finally(() => setEstado('sin-sesion'));
  };

  if (estado === 'cargando' || estado === 'saliendo') return <ActivityIndicator style={{ flex: 1 }} />;
  if (estado !== 'activa') return <PantallaSesion iniciar={iniciar} vencida={estado === 'vencida'} />;
  return <Principal alVencerSesion={() => setEstado('vencida')} salir={salir} />;
}

function Principal({ alVencerSesion, salir }: { alVencerSesion: () => void; salir: () => void }) {
  const [pantalla, setPantalla] = useState<Pantalla>({ nombre: 'viajes' });
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarSalida, setConfirmarSalida] = useState<SinEnviar | null>(null);
  const [menu, setMenu] = useState(false);
  const alCancelarse = useCallback(() => setAviso('Viaje cancelado; llama al despachador'), []);
  const alAlertarFatiga = useCallback(
    (enCola: boolean) =>
      setAviso(
        enCola
          ? 'Alerta de fatiga registrada; detente a descansar'
          : 'Detente a descansar. Sin ubicación todavía: la alerta no quedó registrada',
      ),
    [],
  );
  // Lo que no llegó al servidor se borra al salir: antes se avisa y se pide confirmación.
  const pedirSalida = () => {
    const sinEnviar = cierre.sinEnviar();
    if (sinEnviar.operaciones + sinEnviar.conError + sinEnviar.puntos > 0) setConfirmarSalida(sinEnviar);
    else salir();
  };
  const sync = useSincronizacion(alCancelarse, alVencerSesion);
  // Con un viaje en ruta (aunque el inicio siga en la cola): GPS y detección de frenadas.
  useLiveQuery(bd.select().from(viaje));
  const enRuta = viajes.todos().find((v) => estadoVisible(v) === 'EN_RUTA')?.viajeId ?? null;
  const alFrenar = useCallback(() => setAviso('Frenada brusca registrada'), []);
  const gps = useViajeEnRuta(enRuta, alFrenar);

  // D45: "Viaje asignado" o "Viaje cancelado" baja los viajes de nuevo; tocar la notificación abre el viaje. Si FCM
  // rota el token, se vuelve a registrar el dispositivo.
  useEffect(
    () =>
      escucharPush(
        (viajeId) => {
          void casos.descargarViajes().catch(() => {});
          setPantalla({ nombre: 'viaje', viajeId });
        },
        () => void casos.descargarViajes().catch(() => {}),
        (token) => void casos.registrarDispositivo(token).catch(() => {}),
      ),
    [],
  );

  const volver = useCallback(
    () =>
      setPantalla((p) =>
        p.nombre === 'pendientes'
          ? p.volverA
          : 'viajeId' in p && p.nombre !== 'viaje'
            ? { nombre: 'viaje', viajeId: p.viajeId }
            : { nombre: 'viajes' },
      ),
    [],
  );
  const verPendientes = () => setPantalla((p) => (p.nombre === 'pendientes' ? p : { nombre: 'pendientes', volverA: p }));

  useEffect(() => {
    const atras = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pantalla.nombre === 'viajes') return false;
      volver();
      return true;
    });
    return () => atras.remove();
  }, [pantalla, volver]);

  const total = sync.pendientes + sync.puntos;
  // Pedido a mano: además del ícono, se dice cómo terminó.
  const enviarAMano = async () => {
    const r = await sync.sincronizar();
    if (!r) return setAviso('No se pudo enviar; se reintenta solo');
    const quedan = cola.todas().length + puntos.contar();
    setAviso(
      r.sinConexion ? 'Sin señal: se envía solo cuando vuelva' : quedan ? `Quedan ${quedan} por enviar; se reintenta solo` : 'Envío al día',
    );
  };
  const iconoEnvio = !sync.enLinea ? 'cloud-off-outline' : total ? 'cloud-upload-outline' : 'cloud-check-outline';

  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header>
        {pantalla.nombre !== 'viajes' && <Appbar.BackAction accessibilityLabel="Volver" onPress={volver} />}
        <Appbar.Content title={TITULOS[pantalla.nombre]} />
        <Appbar.Action
          icon={sync.enviando ? () => <ActivityIndicator size={20} /> : iconoEnvio}
          disabled={sync.enviando}
          accessibilityLabel={
            !sync.enLinea
              ? 'Sin conexión. Reintentar envío'
              : total
                ? `${total} por enviar. Enviar ahora`
                : 'Todo enviado. Revisar de nuevo'
          }
          onPress={() => void enviarAMano()}
        />
        <Menu
          visible={menu}
          onDismiss={() => setMenu(false)}
          anchor={<Appbar.Action icon="dots-vertical" accessibilityLabel="Más opciones" onPress={() => setMenu(true)} />}
        >
          <Menu.Item
            leadingIcon="format-list-checks"
            title="Pendientes de envío"
            onPress={() => {
              setMenu(false);
              verPendientes();
            }}
          />
          <Menu.Item
            leadingIcon="logout"
            title="Cerrar sesión"
            onPress={() => {
              setMenu(false);
              pedirSalida();
            }}
          />
        </Menu>
      </Appbar.Header>
      <BarraSincronizacion {...sync} verPendientes={verPendientes} enPendientes={pantalla.nombre === 'pendientes'} />
      {pantalla.nombre === 'viajes' && (
        <PantallaViajes enLinea={sync.enLinea} abrir={(viajeId) => setPantalla({ nombre: 'viaje', viajeId })} />
      )}
      {pantalla.nombre === 'viaje' && (
        <PantallaViaje
          viajeId={pantalla.viajeId}
          gps={gps}
          sincronizar={() => void sync.sincronizar()}
          abrir={(nombre) => setPantalla({ nombre, viajeId: pantalla.viajeId })}
          volver={volver}
          verPendientes={verPendientes}
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
      {pantalla.nombre === 'fatiga' && <PantallaFatiga viajeId={pantalla.viajeId} alAlertar={alAlertarFatiga} />}
      {pantalla.nombre === 'pendientes' && <PantallaPendientes sincronizar={enviarAMano} enviando={sync.enviando} />}
      <Snackbar visible={aviso !== null} onDismiss={() => setAviso(null)} duration={8000}>
        {aviso ?? ''}
      </Snackbar>
      <Portal>
        <Dialog visible={confirmarSalida !== null} onDismiss={() => setConfirmarSalida(null)}>
          <Dialog.Title>¿Cerrar sesión sin enviar?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {confirmarSalida &&
                [
                  confirmarSalida.operaciones ? plural(confirmarSalida.operaciones, 'registro', 'registros') : null,
                  confirmarSalida.conError ? plural(confirmarSalida.conError, 'registro con error', 'registros con error') : null,
                  confirmarSalida.puntos ? plural(confirmarSalida.puntos, 'punto GPS', 'puntos GPS') : null,
                ]
                  .filter(Boolean)
                  .join(' y ')}{' '}
              todavía no llegaron al servidor. Si cierras sesión se borran de este celular. Con señal, sincroniza antes.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmarSalida(null)}>Cancelar</Button>
            <Button
              onPress={() => {
                setConfirmarSalida(null);
                salir();
              }}
            >
              Cerrar sesión y borrar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
