const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
// Migraciones de Drizzle como texto.
config.resolver.sourceExts.push('sql');
// libs/design-tokens se enlaza con file: (fuera de la carpeta del proyecto).
config.watchFolders = [path.resolve(__dirname, '../../libs/design-tokens')];
module.exports = config;
