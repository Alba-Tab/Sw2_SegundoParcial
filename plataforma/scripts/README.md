# Scripts de demo y de fallos

Escenarios de `specs/guion-fallos.md` contra el compose local. Por ahora son solo locales; las variantes `--nube` llegan en F11.

**Antes de empezar:**

```bash
cd plataforma/compose
docker compose --env-file .env --env-file .env.demo --profile core --profile plataforma --profile demo up -d --build
../semilla/cargar.sh
```

El archivo `.env.demo` hace cuatro cosas:

- deja vencer las cotizaciones en `PT2M` (FS1);
- deja vencer la espera de aprobación en `PT3M` (FS3);
- corta las compensaciones en 4 intentos o 2 min (FS8);
- hace pasar Finanzas por Toxiproxy (FS8).

Los scripts sacan los tokens con *direct grant* de `demo-cli` (D39, solo local) y la clave `KC_CLAVE_SEMILLA` de `plataforma/compose/.env`.

Cada uno imprime ✔ o ✘ por cada resultado esperado y termina con código 1 si alguno falla.

**Unidades disponibles.** Cada servicio confirmado de granos ocupa uno de los 3 furgones de la semilla. `saga-doble-clic.sh` y `saga-worker-apagado.sh` cancelan su servicio al final para no ocuparlo. Para volver a empezar de cero: `docker compose down -v`, levantar y correr `cargar.sh`.

## `demo/` (saga, spec 003)

| Script | Escenario | Qué verifica |
|---|---|---|
| `saga-camino-feliz.sh` | Paso 3: Agroexport, Aula, 28 t | `CONFIRMADO` con 4521KTR y 2.800,00 |
| `saga-cotizacion-vencida.sh` | FS1 | `COTIZACION_VENCIDA` sin tocar el disponible (espera 130 s) |
| `saga-sin-credito.sh` | FS2: Ferretería, La Paz, 20 t | `CREDITO_INSUFICIENTE` |
| `saga-mora.sh [aprobar\|rechazar\|vencer]` | FS3: Agro Moroso, La Paz, 20 t | Espera con la reserva pendiente. Después, según el argumento: `CONFIRMADO`, `CREDITO_RECHAZADO` con el disponible de vuelta, o `APROBACION_VENCIDA` |
| `saga-sin-unidad.sh` | FS4: Cochabamba, 20 t de líquidos | `SIN_UNIDAD_COMPATIBLE` con el crédito liberado; imprime el enlace al historial en la Temporal UI |
| `saga-worker-apagado.sh [--reiniciar-viajes]` | FS5 (y FS6) | Espera en `RESERVANDO_UNIDAD`, sigue hasta `CONFIRMADO` y deja un solo viaje |
| `saga-doble-clic.sh` | FS7 (D43) | Dos 202 con el mismo `servicioId` y un solo servicio |
| `saga-compensacion-agotada.sh [--resuelto]` | FS8 (spec 011) | `REQUIERE_INTERVENCION`. Después restaura la base y el despachador reintenta o marca como resuelto |
| `saga-cancelar-en-curso.sh` | FS9 (D17) | `409 CONFIRMACION_EN_CURSO` |

## `fallos/` (interruptores)

| Script | Qué hace (local) |
|---|---|
| `apagar-worker-flota.sh` | `docker compose stop flota-worker` |
| `encender-worker-flota.sh` | `docker compose start flota-worker` |
| `detener-viajes.sh` | `docker compose stop viajes` |
| `detener-finanzas-worker.sh` | `docker compose stop finanzas-worker` |
| `cortar-db-finanzas.sh off\|on` | Corta o restaura el proxy `finanzas-db` de Toxiproxy |
