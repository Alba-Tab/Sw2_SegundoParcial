// Genera tokens/color.json con el mismo algoritmo de Material Theme Builder (esquema "tonal spot" de Material 3) a
// partir del color semilla. Solo se corre al cambiar la semilla; el resto del sistema lee tokens/*.json.
import { writeFileSync } from 'node:fs';
import {
  argbFromHex,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeTonalSpot,
  TonalPalette,
} from '@material/material-color-utilities';

const SEMILLA = '#1D5FA6'; // azul de la marca
const PROPIOS = { exito: '#2E7D32', advertencia: '#B26A00' }; // colores de estado, armonizados como "custom colors"

const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest', 'outline', 'outlineVariant', 'shadow', 'scrim',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary',
];


const esquema = (oscuro) => {
  const s = new SchemeTonalSpot(Hct.fromInt(argbFromHex(SEMILLA)), oscuro, 0);
  const roles = Object.fromEntries(ROLES.map((r) => [r, { $value: hexFromArgb(MaterialDynamicColors[r].getArgb(s)), $type: 'color' }]));
  for (const [nombre, hex] of Object.entries(PROPIOS)) {
    const p = TonalPalette.fromInt(argbFromHex(hex));
    const [t, on, cont, onCont] = oscuro ? [80, 20, 30, 90] : [40, 100, 90, 10];
    const mayus = nombre[0].toUpperCase() + nombre.slice(1);
    roles[nombre] = { $value: hexFromArgb(p.tone(t)), $type: 'color' };
    roles[`on${mayus}`] = { $value: hexFromArgb(p.tone(on)), $type: 'color' };
    roles[`${nombre}Container`] = { $value: hexFromArgb(p.tone(cont)), $type: 'color' };
    roles[`on${mayus}Container`] = { $value: hexFromArgb(p.tone(onCont)), $type: 'color' };
  }
  return roles;
};

const salida = {
  $description: `Material 3, tonal spot, semilla ${SEMILLA}. Generado por scripts/paleta.mjs; no se edita a mano.`,
  color: { claro: esquema(false), oscuro: esquema(true) },
};
writeFileSync(new URL('../tokens/color.json', import.meta.url), `${JSON.stringify(salida, null, 2)}\n`);
console.log(`tokens/color.json: ${ROLES.length + 4 * Object.keys(PROPIOS).length} roles por esquema`);
