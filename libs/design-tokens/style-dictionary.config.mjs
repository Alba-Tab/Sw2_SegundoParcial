// D47: tokens/*.json → generado/ (variables CSS, Angular Material, MUI y React Native Paper). `npm run construir`.
import StyleDictionary from 'style-dictionary';

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const AVISO = '/* Generado por libs/design-tokens (Style Dictionary). No se edita a mano: cambia tokens/ y corre npm run construir. */';

/** { claro: {rol: hex}, oscuro: {...}, base: {'espacio-1': '4px', ...} } */
function agrupar(dictionary) {
  const g = { claro: {}, oscuro: {}, base: {} };
  for (const t of dictionary.allTokens) {
    if (t.path[0] === 'color') g[t.path[1]][t.path[2]] = t.$value;
    else g.base[t.path.join('-')] = t.$value;
  }
  return g;
}

const bloque = (selector, vars) => `${selector} {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
const conPrefijo = (prefijo, roles) => Object.fromEntries(Object.entries(roles).map(([k, v]) => [`${prefijo}${kebab(k)}`, v]));

/**
 * Claro por defecto; oscuro con data-tema="dark" o por la preferencia del sistema si no se eligió tema. Los valores
 * light/dark son los que escribe MUI con colorSchemeSelector: 'data-tema', así todas las apps comparten el atributo.
 */
function cssPorTema(claro, oscuro, extra = {}) {
  return [
    AVISO,
    bloque(':root,\n[data-tema="light"]', { ...claro, ...extra }),
    bloque('[data-tema="dark"]', oscuro),
    `@media (prefers-color-scheme: dark) {\n${bloque(':root:not([data-tema])', oscuro).replace(/^/gm, '  ')}\n}`,
    '',
  ].join('\n\n');
}

StyleDictionary.registerFormat({
  name: 'transporte/css',
  format: ({ dictionary }) => {
    const g = agrupar(dictionary);
    return cssPorTema(conPrefijo('--tc-color-', g.claro), conPrefijo('--tc-color-', g.oscuro), conPrefijo('--tc-', g.base));
  },
});

// Angular Material (M3) lee sus roles de --mat-sys-*; T9.4 importa este archivo en ui-comun.
StyleDictionary.registerFormat({
  name: 'transporte/angular-material',
  format: ({ dictionary }) => {
    const g = agrupar(dictionary);
    const radios = { '--mat-sys-corner-small': g.base['radio-sm'], '--mat-sys-corner-medium': g.base['radio-md'], '--mat-sys-corner-large': g.base['radio-lg'] };
    return cssPorTema(conPrefijo('--mat-sys-', g.claro), conPrefijo('--mat-sys-', g.oscuro), { ...radios, '--mat-sys-body-large-font': g.base['fuente-base'] });
  },
});

const paletaMui = (r) => ({
  primary: { main: r.primary, contrastText: r.onPrimary },
  secondary: { main: r.secondary, contrastText: r.onSecondary },
  info: { main: r.tertiary, contrastText: r.onTertiary },
  error: { main: r.error, contrastText: r.onError },
  success: { main: r.exito, contrastText: r.onExito },
  warning: { main: r.advertencia, contrastText: r.onAdvertencia },
  background: { default: r.surface, paper: r.surfaceContainerLow },
  text: { primary: r.onSurface, secondary: r.onSurfaceVariant },
  divider: r.outlineVariant,
});

const px = (v) => Number.parseInt(v, 10);

StyleDictionary.registerFormat({
  name: 'transporte/mui',
  format: ({ dictionary }) => {
    const g = agrupar(dictionary);
    const opciones = {
      cssVariables: { colorSchemeSelector: 'data-tema' },
      colorSchemes: { light: { palette: paletaMui(g.claro) }, dark: { palette: paletaMui(g.oscuro) } },
      shape: { borderRadius: px(g.base['radio-md']) },
      spacing: px(g.base['espacio-unidad']),
      typography: { fontFamily: g.base['fuente-base'], button: { textTransform: 'none', fontWeight: 600 } },
    };
    return `${AVISO}\n/** Opciones de createTheme de MUI (con cssVariables y esquemas claro y oscuro). */\nexport const opcionesTemaMui = ${JSON.stringify(opciones, null, 2)};\n\n/** Los roles de Material 3, para lo que MUI no nombra (contenedores, superficies). */\nexport const rolesM3 = ${JSON.stringify({ claro: g.claro, oscuro: g.oscuro }, null, 2)};\n`;
  },
});

const alfa = (hex, a) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
/** Colores MD3 de React Native Paper: los roles de M3 más las elevaciones y los estados deshabilitados. */
const coloresPaper = (r) => ({
  ...r,
  elevation: {
    level0: 'transparent',
    level1: r.surfaceContainerLow,
    level2: r.surfaceContainer,
    level3: r.surfaceContainerHigh,
    level4: r.surfaceContainerHigh,
    level5: r.surfaceContainerHighest,
  },
  surfaceDisabled: alfa(r.onSurface, 0.12),
  onSurfaceDisabled: alfa(r.onSurface, 0.38),
  backdrop: alfa(r.scrim, 0.4),
});

StyleDictionary.registerFormat({
  name: 'transporte/paper',
  format: ({ dictionary }) => {
    const g = agrupar(dictionary);
    const temas = { claro: { dark: false, roundness: px(g.base['radio-sm']) / 2, colors: coloresPaper(g.claro) }, oscuro: { dark: true, roundness: px(g.base['radio-sm']) / 2, colors: coloresPaper(g.oscuro) } };
    return `${AVISO}\n/** Se mezcla con MD3LightTheme / MD3DarkTheme de React Native Paper (T7.2). */\nexport const temasPaper = ${JSON.stringify(temas, null, 2)};\n`;
  },
});

const DTS = {
  'mui.d.ts': `${AVISO}\nimport type { CssVarsThemeOptions } from '@mui/material/styles';\nexport declare const opcionesTemaMui: CssVarsThemeOptions & { cssVariables: { colorSchemeSelector: string } };\nexport declare const rolesM3: { claro: Record<string, string>; oscuro: Record<string, string> };\n`,
  'paper.d.ts': `${AVISO}\ntype Colores = Record<string, string> & { elevation: Record<'level0' | 'level1' | 'level2' | 'level3' | 'level4' | 'level5', string> };\nexport declare const temasPaper: { claro: { dark: false; roundness: number; colors: Colores }; oscuro: { dark: true; roundness: number; colors: Colores } };\n`,
};
StyleDictionary.registerFormat({ name: 'transporte/dts', format: ({ file }) => DTS[file.destination] });

const sd = new StyleDictionary({
  source: ['tokens/**/*.json'],
  usesDtcg: true,
  log: { verbosity: 'silent' },
  platforms: {
    web: {
      buildPath: 'generado/',
      files: [
        { destination: 'tokens.css', format: 'transporte/css' },
        { destination: 'angular-material.css', format: 'transporte/angular-material' },
        { destination: 'mui.js', format: 'transporte/mui' },
        { destination: 'mui.d.ts', format: 'transporte/dts' },
        { destination: 'paper.js', format: 'transporte/paper' },
        { destination: 'paper.d.ts', format: 'transporte/dts' },
      ],
    },
  },
});
await sd.buildAllPlatforms();
console.log('generado/: tokens.css, angular-material.css, mui.js, paper.js');
