# Simulador de combustible

Sensor simulado del tanque (T5.4, spec 009). Cada 10 s publica un `LecturaSensorCombustible.v1` por placa en el tema MQTT `camion/{placa}/combustible`. RabbitMQ lo deja en `amq.topic` con la clave `camion.{placa}.combustible` y Flota lo consume por AMQP desde `flota.sensor` (D30). Node 24 con `mqtt`.

## Escenarios

| Escenario | Qué hace |
|---|---|
| `normal` | Ciclos de 5 min en marcha (65 km/h, baja 0,05 puntos por lectura) y 1 min detenido sin bajar. No dispara detecciones |
| `robo` | Una lectura en marcha, una detenida (la referencia) y 6 detenidas bajando 2 puntos cada una: 12 puntos en 60 s. Flota detecta a los 40 s (D08). Después sigue como `normal` |

## Uso

```bash
cd plataforma/simulador-combustible && npm ci
MQTT_CLAVE=sensor-sim npm run simular -- --placa 4521KTR --escenario robo
```

O dentro de compose (usa `RABBITMQ_CLAVE_SENSOR` de `.env` y `mqtt://rabbitmq:1883`):

```bash
docker compose -f plataforma/compose/compose.yaml --profile simulador run --rm --no-deps simulador-combustible --placa 4521KTR --escenario robo
```

| Opción | Por defecto | |
|---|---|---|
| `--placa` | `4521KTR` | Una o varias, separadas por coma |
| `--escenario` | `normal` | `normal` o `robo` |
| `--nivel` | `62` | Nivel inicial en % |
| `--capacidad` | `600` | `capacidadLitros` del mensaje |
| `--intervalo` | `10` | Segundos entre lecturas (las pruebas usan 1) |
| `--lecturas` | sin límite | Termina después de N lecturas |

| Variable | Por defecto | |
|---|---|---|
| `MQTT_URL` | `mqtt://localhost:1883` | En la nube (F3b), `mqtts://…:8883` |
| `MQTT_USUARIO` | `sensor-sim` | Solo puede publicar en `camion.*.combustible` (D73) |
| `MQTT_CLAVE` | obligatoria | `RABBITMQ_CLAVE_SENSOR` |
| `MQTT_CA` | — | Ruta de la CA propia para `mqtts://` |

El reloj arranca con la primera conexión. Si el broker cae, el simulador reintenta cada 5 s (D74) y las lecturas de ese lapso se pierden: es un sensor, no una operación.

## Pruebas

`npm test` (node:test) comprueba los dos escenarios y que el mensaje cumpla el contrato. `plataforma/scripts/demo/ff1-robo-combustible.sh` hace la prueba FF1 de punta a punta contra compose.
