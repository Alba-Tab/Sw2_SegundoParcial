# Portal del cliente

React 19 + Vite, PWA. Material 3 con **MUI v7** y el tema de `libs/design-tokens` (D46, D47); React Compiler por Babel; TanStack Query, Router y Table (D48); clientes y esquemas zod generados con Orval desde `contratos/openapi` (D49). Puerto **5173**.

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala (los tokens se enlazan desde `../../libs/design-tokens`) |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run verificar` | Tipos, ESLint, Prettier y Vitest |
| `npm run build` | Compila a `dist/` |
| `npm run storybook` | Catálogo de componentes en http://localhost:6006 (tema claro y oscuro desde la barra) |

## Estructura

- `src/compartido/`: tema, componentes comunes (con su historia de Storybook y su prueba).
- `src/features/<feature>/`: una carpeta por flujo (cuenta, cotizar, servicios, facturas).
