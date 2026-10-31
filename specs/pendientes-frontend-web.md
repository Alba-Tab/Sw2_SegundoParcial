# Pendientes: frontends web

Fecha: 2026-10-31. Lo que no se arregló en la iteración de la app móvil (rama `fix/app-chofer/pulido-movil`) y toca a `frontends/centro-control` (4 apps Angular + `ui-comun`) y `frontends/portal-cliente`. El diagnóstico detallado de navegación, gestión, iconografía y UX está en `specs/plan-arreglos-frontend.md` (otra sesión, mismo día); este archivo agrega lo que ese plan no tiene y fija el orden. Lo que queda de la app móvil está en `specs/revisiones/movil-vuelta-3.md`.

## 1. Fallas con causa encontrada (no están en plan-arreglos-frontend.md)

| # | Síntoma | Causa | Dónde | Arreglo |
|---|---|---|---|---|
| W1 | Los íconos del centro de control salen como texto (`notifications`, `logout`, `download`) | Ninguna de las 4 apps carga la fuente Material Symbols/Icons: `<mat-icon>` dibuja el nombre del glifo | `frontends/centro-control/projects/*/src/index.html` y `styles.*` | Empaquetar la fuente desde npm (`material-symbols`) en `ui-comun` e importarla en el `styles` de cada app, sin depender de Google Fonts en la nube. Rama `fix/ui-comun/fuente-iconos`. Es requisito de las tareas de iconos (I1–I6) del otro plan |
| W2 | Analítica «no da»: la pregunta por voz responde 503 | El intercambio de token RFC 8693 de analítica contra Keycloak responde **400** antes de llegar al MCP (`POST /api/v1/voz/preguntas` → `LLM`/`DEPENDENCIA_NO_DISPONIBLE`) | `servicios/analitica/app/infraestructura/tokens.py:64`, `plataforma/keycloak/*.json` | Leer `error_description` del 400. Revisar en el realm que el cliente de analítica tenga *token exchange* habilitado y permiso sobre la audiencia del MCP. Si es configuración, va en `plataforma` (sin cambiar contratos). Rama `fix/analitica/intercambio-token` |
| W3 | «Riesgo de retraso» se muestra como error | `GET /predicciones/retraso/{viajeId}` responde 404 cuando aún no hay predicción y la tarjeta no lo distingue de una falla | `cc-operaciones/.../viajes/ui/viaje.ts:55` | 404 = «Aún no hay datos para estimar el retraso». Rama `fix/cc-operaciones/sin-prediccion` |
| W4 | Iconos de estado/acción sin significado único y botones que se desactivan sin explicar | Mismo patrón que se corrigió en la app móvil (C-7): el botón gris no dice qué falta | formularios de `cc-*` y del portal | Dejar el botón activo; al enviar con errores, marcar todos los campos y enfocar el primero |

## 2. Orden de trabajo (sin decisiones pendientes)

1. **W1** fuente de iconos (bloquea la iconografía del otro plan).
2. **W2** y **W3** (analítica y predicción).
3. `plan-arreglos-frontend.md` Fase A (base de diseño: estados con texto + ícono + tono, alertas sin raya lateral).
4. Fase B (navegación): `cc-encabezado` con migas y «volver» en todos los detalles (N1), pestañas en `cc-tablero` (N2), marca que lleva al inicio (N3), página 404 en vez de redirigir en silencio (N4), alertas con «volver a la app» (N5), portal (N6, N7).
5. Fase C (encontrar las cosas): iconos en pestañas, acciones de tabla y estados, con el texto fuera del `mat-icon`.
6. Fase D, solo lo que ya tiene backend: **G1 unidades** (alta, edición y baja: `POST/PUT /unidades` y `POST /unidades/{id}/baja` ya existen en Flota; faltan las mutaciones en `contratos/graphql/centro-control.graphql`, el resolvedor del gateway con `Idempotency-Key` y el formulario en `cc-flota`) y la lista de **clientes** (`GET /clientes` ya existe).
7. Fase E: lo que se aprendió en la app móvil y aplica también aquí: no mostrar errores técnicos (mapear `codigo` de 000 §5 a texto), confirmar las acciones irreversibles con un resumen, estados vacío/carga/error con salida, objetivos táctiles de 44 px, y contraste AA en claro y oscuro.

## 3. Decisiones pendientes (no se avanzan sin respuesta)

Quedan abiertas a propósito en esta iteración (decisiones 2 y 3 del plan `plan-iteracion-ui.md`):

1. **Gestión de usuarios internos (G8):** consola de Keycloak (sin código) o pantalla propia sobre la Admin API (llamada síncrona nueva, requiere spec y contrato).
2. **Gestión de rutas (G4) y tarifas (G5):** hoy solo lectura o inexistentes; necesitan spec y contrato nuevos en Viajes/Finanzas, y una decisión nueva frente a D12/D102 (datos de semilla).
3. **Choferes (G3):** alta y habilitación dependen de cómo se vinculen con el usuario de Keycloak (`usuarioSub`), así que van con la decisión 1.

## 4. Cómo se verifica cada arreglo

`npm test` y `npm run lint` de la app tocada. En el navegador con el preview: sin errores de consola, el ícono se dibuja (no su nombre), «volver» existe en cada detalle y una ruta inventada muestra la página 404. Contratos: si se agrega una mutación, el gateway y la app compilan contra el esquema nuevo en el mismo commit.
