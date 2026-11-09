import { temasPaper } from '@transporte/design-tokens/paper';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

/** Material 3 con los colores de libs/design-tokens (D46, D47): los mismos del portal y el Centro de Control. */
export const temaClaro = {
  ...MD3LightTheme,
  roundness: temasPaper.claro.roundness,
  colors: { ...MD3LightTheme.colors, ...temasPaper.claro.colors },
};
export const temaOscuro = {
  ...MD3DarkTheme,
  roundness: temasPaper.oscuro.roundness,
  colors: { ...MD3DarkTheme.colors, ...temasPaper.oscuro.colors },
};
