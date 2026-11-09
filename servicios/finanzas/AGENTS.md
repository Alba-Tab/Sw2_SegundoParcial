# AGENTS.md: Finanzas (Laravel 13, PHP 8.4, DDD táctico)

Manda dentro de `servicios/finanzas/`; lo demás está en el AGENTS.md de la raíz.

## Capas (Deptrac las verifica con `vendor/bin/deptrac analyse`)

| Namespace | Qué va | Puede usar |
|---|---|---|
| `App\Dominio` | Agregados con invariantes (`LineaCredito`, `Cotizacion`, `Factura`), value object `Monto` (brick/money), `ErrorDeDominio` con el código de 000 §5 | Solo PHP y `Brick\*`. Nada de Laravel ni Eloquent |
| `App\Aplicacion` | Casos de uso y **puertos** (`App\Aplicacion\Puertos`) | `Dominio` |
| `App\Infraestructura` | Eloquent/Query Builder, Outbox y relay, consumidor de eventos, HTTP, actividades de Temporal, logs | Todo |

## Reglas propias

- Un evento se deja con `RegistroDeEventos::registrar(...)` dentro de `DB::transaction(...)` (falla fuera de una). El relay `outbox:publicar` lo publica.
- Cada consumidor de evento registra el `eventId` en `inbox_eventos` en la misma transacción que su efecto (`eventos:consumir`).
- Dinero solo con `Monto`; un monto negativo se rechaza en el value object.
- Procesos: la API es Octane sobre RoadRunner 2025.1.15 (`/app/rr`, 4 workers). El worker es RoadRunner 3.0.1 con Temporal y el plugin `service` (`eventos:consumir`, `outbox:publicar`), D29.
- Larastan nivel 6 sobre `app/`.

## Comandos

```bash
./probar.sh   # Pest (unitarias + Feature contra PostgreSQL y RabbitMQ del compose), Deptrac y Larastan, en Docker
```

No hace falta PHP en la Mac: todo corre en la imagen `dev` del Dockerfile.
