# Tokens de diseño

Un solo origen para los colores, la tipografía, el espacio y los radios de las 6 interfaces (D46, D47). Material 3 en todas: Angular Material (4 apps), MUI v7 (portal) y React Native Paper (app del chofer).

| Archivo | Qué es |
|---|---|
| `tokens/color.json` | Roles de Material 3, claro y oscuro, más `exito` y `advertencia`. Lo genera `npm run paleta` desde la semilla `#1D5FA6` con el algoritmo de Material Theme Builder (esquema *tonal spot*); no se edita a mano |
| `tokens/base.json` | Fuentes, tamaños, espacio (múltiplo de 8 px) y radios |
| `style-dictionary.config.mjs` | Los formatos de salida |

Salidas en `generado/` (se versionan; CI verifica que coincidan con `tokens/`):

| Salida | Lo usa | Cómo |
|---|---|---|
| `tokens.css` | Cualquier web | Variables `--tc-color-*`, `--tc-espacio-*`, `--tc-radio-*`, `--tc-fuente-*` |
| `angular-material.css` | Centro de Control (T9.4) | Roles `--mat-sys-*` de Angular Material |
| `mui.js` | Portal | `createTheme(opcionesTemaMui)`; también `rolesM3` para contenedores y superficies |
| `paper.js` | App del chofer (T7.2) | `{ ...MD3LightTheme, ...temasPaper.claro, colors: { ...MD3LightTheme.colors, ...temasPaper.claro.colors } }` |

El tema oscuro se elige con `data-tema="dark"` en `<html>` (lo pone MUI) o sigue la preferencia del sistema si no hay atributo.

```bash
npm ci
npm run paleta      # solo si cambia la semilla
npm run construir   # tokens/ → generado/
```

Las apps lo consumen como dependencia local: `"@transporte/design-tokens": "file:../../libs/design-tokens"`.
