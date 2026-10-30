const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
// Migraciones de Drizzle como texto.
config.resolver.sourceExts.push('sql');
// Los modelos de Whisper y de la malla facial viajan como assets (require).
config.resolver.assetExts.push('bin', 'tflite');
// libs/design-tokens se enlaza con file: (fuera de la carpeta del proyecto).
config.watchFolders = [path.resolve(__dirname, '../../libs/design-tokens')];
module.exports = config;
