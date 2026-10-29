# Guion de fallos controlados

Estado: **aprobado** (28/10/2026). Parte de [plan-desarrollo.md](plan-desarrollo.md). Cada escenario pasa por `pendiente` → `listo local` → `listo nube`; se actualiza al cerrar cada hito y se usa en la defensa.

## Escenarios y scripts

### 1 Escenarios

En la columna "Listo", el hito indica cuándo funciona en local. "Solo local" quiere decir que no se demuestra en la nube.

| ID | Escenario | Cómo se provoca | Qué se espera ver | Listo |
|---|---|---|---|---|
| FS1 | Cotización vencida | Vigencia `PT2M` | `COTIZACION_VENCIDA`; se compensa el paso 1 | H4 (portal H6) |
| FS2 | Sin crédito | "Ferretería Sin Crédito", La Paz, 20 t = 7.600 | `CREDITO_INSUFICIENTE` | H4 |
| FS3 | Mora o monto alto | "Agro Moroso", La Paz, 20 t = 7.600 (disponible 25.000); o Arica con 28 t | Espera; aprobar o rechazar; `APROBACION_VENCIDA` con `PT3M` | H4 (interfaz H9) |
| FS4 | Sin unidad compatible | **Cochabamba, 20 t de `INSUMOS_LIQUIDOS` = 6.250**; la cisterna está en mantenimiento | Se libera el crédito y se cancela el viaje (orden inverso) | H4 |
| FS5 | Worker de Flota apagado | `apagar-worker-flota.sh`, luego `encender-worker-flota.sh` | Espera y continúa | H4 |
| FS6 | Worker de Viajes a la mitad | FS5 y además `detener-viajes.sh` | Retoma sin duplicar | H4 |
| FS7 | Doble clic | Doble clic, o 2 curl con la misma clave | **Dos 202 con el mismo `servicioId`** y un solo workflow (D43) | H4 (nube: portal) |
| FS8 | Compensación agotada | `saga-compensacion-agotada.sh`: (1) apagar el worker de Flota; (2) confirmar FS4, con el paso 2 reservado; (3) local: cortar el proxy 25433; nube: `detener-finanzas-worker.sh`; (4) encender el worker de Flota → `SIN_UNIDAD_COMPATIBLE` → `liberarCredito` se agota (4 intentos o 2 min) | `REQUIERE_INTERVENCION`, `ViajeRequiereIntervencion`; se restaura y se elige "reintentar" | H4 (evento), H8 (alerta), H9 (interfaz) |
| FS9 | Cancelar durante la confirmación | curl | 409 `CONFIRMACION_EN_CURSO` | H4 (solo prueba) |
| FC1 | Finanzas detenida | `detener-finanzas-worker.sh`, entregar, mirar `finanzas.eventos` (local en 15672; nube por `tunel-consolas.sh`), encender | Factura, `CERRADO` y correo | H5 |
| FC2 | Evento repetido | `republicar-evento.sh <eventId>` | Un solo correo | H5 |
| FC3 | Mensaje inválido | Publicar un mensaje que no cumple el esquema | Va a la DLQ | H5 (solo local) |
| FC4 | Cancelación | Cancelar un `CONFIRMADO` | Crédito y unidad liberados | H5 |
| FC5 | Broker caído | Detener `rabbitmq` | El Outbox publica al volver | H5 (solo local) |
| FC6 | Latencia | Toxiproxy en 28103 | Respuesta parcial | H9 (solo local) |
| FR1 | Detener Flota (req. 1) | `caer-flota.sh` | Viajes y Finanzas responden; Flota sale vacío con su error | H9 |
| FR2 | Cae Finanzas (req. 3) | `caer-finanzas-api.sh` | Respuesta GraphQL parcial | H9 |
| FR3 | App caída (req. 5) | `caer-app.sh cc-flota` | Las demás siguen | H11 (solo nube) |
| FR4 | LLM caído | Detener Ollama | Misión saltada; catálogo con botones | H10 |
| FO1 | Modo avión | Operar sin señal | Sincroniza un registro por operación | H7 |
| FO2 | Red limitada | Network Link Conditioner | Reintentos con espera creciente | H7 |
| FO3 | Misma clave | curl dos veces; otro cuerpo | Misma respuesta; 422 | H4 (nube: `demo-cli` por *device grant*) |
| FO4 | *Throttling* | **Prueba con *throttling* simulado** (T7.1). Opcional en la nube: `throttle-gps.sh` deja `gps_puntos` en 1 WCU (verificar antes el *burst* de 300 s) y luego la restaura | No se muestra como error al chofer | H7 (prueba), H11 (opcional) |
| FO5 | Fuera de la geocerca o sin firma | Entregar lejos del Aula | `ENTREGA_OBSERVADA`; alerta; aprobación | H7 (estado), H8 (alerta), H9 (aprobación) |
| FO6 | Fatiga sin red | Cámara en primer plano | Cajas y etiquetas | H7 |
| FO7 | Rechazo | Foto y motivo | `ENTREGA_RECHAZADA`; crédito y unidad liberados | H7 |
| FK1 | 401, 403 y otro cliente | Sin token; cliente en cc-*; cliente A pide datos de B | 401, "Sin acceso" y 403 | H9 |
| FK2 | Salto de SSO | Entre apps; "Ver como cliente" | Sin contraseña | H9 |
| FK3 | Cierre de sesión único | Cerrar sesión y volver a otra pestaña | Pide login | H9 |
| FK4 | Consolas cerradas | Abrir la URL pública de la Temporal UI o de la consola de RabbitMQ | No responde; solo por túnel | H11 (solo nube) |
| FM1 | Inspector | Herramienta válida, inválida y sin alcance | Aceptada, rechazada, oculta | H10 |
| FM2 | Inyección en la bitácora | Bitácora maliciosa | Se trata como dato | H10 |
| FM3 | Aviso del agente | Disparo manual; aprobar y rechazar | Correo; `RECHAZADA` | H10 |
| FM4 | Voz | Normal, ambigua, fuera de alcance, sin permiso | Las 4 respuestas esperadas | H10 |
| FF1 | Robo de combustible | Simulador en escenario `robo` | Evento (H5), alerta (H8), interfaz (H9) | H5–H9 |
| FF2 | Carga exagerada | Registrar la carga | Anomalía y alerta | H8 |
| FF3 | Mantenimiento | La unidad de 9.950 km entrega (+120 km) | `MANTENIMIENTO_PENDIENTE`; la saga no la reserva | H5 |
| FF4 | Datos (req. 4) | Pago negativo; cisterna y furgón; TTL vencido sembrado 3 días o más antes | Rechazo; campos distintos; los puntos desaparecen | H5, H12 |
| FCI1 | Despliegue selectivo | Tocar solo cc-flota | Solo corre ese workflow | H11 |
| FCI2 | Capas rotas | Import prohibido | CI en rojo | H3 |

### 2 Scripts de fallos

En `plataforma/scripts/fallos/`. Los que dicen "verificar" se confirman en F3b o F11.

| Script | Local | Nube |
|---|---|---|
| `apagar-worker-flota.sh` / `encender-worker-flota.sh` | `docker compose stop` / `start flota-worker` | `gcloud run worker-pools update flota-worker --instances=0` / `=1` (verificar) |
| `detener-viajes.sh` | `docker compose stop viajes` | SSM: `docker compose stop viajes` |
| `detener-finanzas-worker.sh` | `docker compose stop finanzas-worker` | `az containerapp revision deactivate` (se restaura con `activate`) |
| `caer-finanzas-api.sh` | `docker compose stop finanzas-api` | `az containerapp ingress disable -n finanzas` (se restaura con `enable`) |
| `caer-flota.sh` | Detener API y worker | `gcloud run services update flota --ingress=internal` (o quitar el invoker `allUsers`) más worker pool a 0; se restaura con `--ingress=all` |
| `caer-app.sh <sitio>` | — | `firebase hosting:disable --site <sitio>`; se restaura volviendo a desplegar |
| `cortar-db-finanzas.sh` | `toxiproxy-cli toggle finanzas-db` | — |
| `republicar-evento.sh` | Lee el Outbox y publica con `rabbitmqadmin` | Igual, por SSM |
| `tunel-consolas.sh` | — | Reenvío de puertos por SSM a 8233 y 15672 |
| `throttle-gps.sh` | — | `aws dynamodb update-table`, en 1 WCU y luego 20 |

---
