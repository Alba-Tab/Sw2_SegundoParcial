---
register: product
---

# Producto

Sistema de transporte de carga pesada con base en Santa Cruz. Dos interfaces web: el **Centro de Control** (4 apps Angular: Tablero, Operaciones, Flota y Finanzas) para el equipo interno y el **Portal del cliente** (React) para las empresas que contratan viajes. La app del chofer tiene sus propias reglas y no entra aquí.

Registro **producto**: la interfaz sirve al trabajo. No se luce, no vende y no decora. Cada pantalla responde una pregunta de quien la abre.

## Usuarios por rol

| Rol | Qué hace | Apps | Pregunta que trae |
|---|---|---|---|
| `gerente` | Mira el negocio completo y decide | Las 4 | ¿Cómo vamos hoy? ¿Qué está en riesgo? |
| `despachador` | Sigue los viajes en ruta, atiende entregas observadas e intervenciones, aprueba las acciones del agente | Tablero, Operaciones | ¿Qué viaje necesita una decisión mía ahora? |
| `jefe_flota` | Cuida tractos y remolques: mantenimientos, documentos, combustible, conducción | Tablero, Flota | ¿Qué unidad no puede salir y por qué? |
| `administracion` | Cobra: facturas, pagos, aprobaciones de crédito | Tablero, Finanzas | ¿Quién debe, cuánto y desde cuándo? |
| `comercial` | Atiende al cliente por teléfono; puede abrir el portal como el cliente | Tablero, Operaciones, Portal | ¿En qué estado está el servicio de este cliente? |
| `cliente` | Cotiza, confirma, sigue su viaje, ve la prueba de entrega y sus facturas | Portal | ¿Dónde está mi carga y cuánto debo? |

## Escena de uso

- **Despachador:** oficina de operaciones, monitor de escritorio de 24", turno de 8 a 10 horas con el Centro de Control abierto todo el día junto al teléfono y WhatsApp. Mira la pantalla de reojo entre llamadas; una alerta tiene que entenderse en un vistazo, sin leer un párrafo.
- **Jefe de flota:** laptop en la oficina del taller, a veces con ruido y luz fuerte de la playa de maniobras. Revisa vencimientos de SOAT e inspección técnica antes de liberar una unidad.
- **Administración:** escritorio con dos monitores, la planilla del banco en uno y Finanzas en el otro. Registra pagos copiando referencias; los montos tienen que leerse sin ambigüedad (`2.800,00 BOB`).
- **Gerente:** laptop o tablet en reuniones; abre el Tablero para responder una pregunta concreta y lo cierra.
- **Cliente:** celular de gama media, a veces con señal débil, desde el depósito o la planta mientras espera la carga. También desde la computadora de su oficina para descargar facturas.

## Tono

Directo, sereno y en español de Bolivia. Frases cortas que dicen qué pasó y qué hacer: «La cotización venció. Pide una nueva.». Sin jerga técnica (nada de `ERROR_INTERNO`, `404` ni nombres de enums en pantalla), sin exclamaciones, sin humor y sin culpar al usuario. Los números con formato local: `2.800,00 BOB`, `03/11/2026`, hora de La Paz.

## Anti-referencias

- Plantillas de tablero «hero metric»: grilla de tarjetas iguales con una cifra gigante y un gráfico decorativo.
- Paneles de administración genéricos con barra lateral oscura, degradados y glassmorphism.
- Rayas laterales de color para marcar severidad, o el color como única señal de un estado.
- Texto en mayúsculas con guion bajo (`EN_RUTA`) o códigos técnicos visibles.
- Íconos de adorno que no dicen nada, o el mismo ícono para cosas distintas.
- Botones deshabilitados sin explicar qué falta.

## Principios

1. **Lo que pide acción va primero.** Riesgo, alertas abiertas, mora: arriba. Las cifras de contexto, después.
2. **Un estado se dice tres veces:** texto, ícono y tono. Nunca solo color.
3. **Nunca un callejón sin salida.** Toda pantalla dice dónde estás y cómo volver; todo error dice qué hacer.
4. **El servidor manda; la interfaz no inventa.** El menú no es seguridad, los números salen del backend y si un servicio cae se dice cuál y se muestra lo demás.
5. **Consistencia antes que novedad.** Mismo patrón de página, mismos tokens y mismas etiquetas en las 4 apps y en el portal.
6. **Accesible por defecto:** contraste AA en claro y oscuro, teclado completo, objetivos de 44 px en táctil, íconos decorativos con `aria-hidden`.
