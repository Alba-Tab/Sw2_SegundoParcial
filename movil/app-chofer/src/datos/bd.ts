import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as esquema from './esquema';

/** Una sola base por instalación; las migraciones de drizzle/ se aplican al abrir la app (App.tsx). */
export const sqlite = openDatabaseSync('chofer.db', { enableChangeListener: true });
export const bd = drizzle(sqlite, { schema: esquema });
