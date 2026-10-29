// Modelos y audio de prueba como assets (whisper.rn y fast-tflite los cargan con require()).
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite', 'bin', 'wav');
module.exports = config;
