import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('poc.db');
db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS puntos_gps (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL, lng REAL, precision REAL, registrado_en TEXT, app_estado TEXT);
  CREATE TABLE IF NOT EXISTS cola (clave TEXT PRIMARY KEY, tipo TEXT, cuerpo TEXT, creado_en TEXT);
`);
