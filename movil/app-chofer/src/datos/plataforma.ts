import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { Platform } from 'react-native';
import type { Dispositivo, Ids, Red, Reloj } from '../aplicacion/puertos';
import { bd } from './bd';
import { ajuste } from './esquema';

/** Hermes no trae crypto.randomUUID (PoC-4): las claves de la cola salen de expo-crypto. */
export const ids: Ids = { nuevo: () => Crypto.randomUUID() };

export const reloj: Reloj = { ahora: () => new Date() };

export const red: Red = {
  hayConexion: async () => (await Network.getNetworkStateAsync()).isConnected === true,
};

/** El `dispositivoId` se crea una vez por instalación y queda en SQLite. */
export const dispositivo: Dispositivo = {
  id() {
    const guardado = bd.select().from(ajuste).where(eq(ajuste.clave, 'dispositivoId')).get();
    if (guardado) return guardado.valor;
    const nuevo = ids.nuevo();
    bd.insert(ajuste).values({ clave: 'dispositivoId', valor: nuevo }).run();
    return nuevo;
  },
  plataforma: () => (Platform.OS === 'android' ? 'ANDROID' : 'IOS'),
};
