# AGENTS.md: Flota (NestJS 11, Node 24, Clean)

Manda dentro de `servicios/flota/`; lo demás está en el AGENTS.md de la raíz.

## Capas (dependency-cruiser las verifica con `npm run capas`)

| Carpeta | Qué va | Puede importar |
|---|---|---|
| `src/dominio` | Entidades, value objects (`Monto` con decimal.js), reglas; `ErrorDeDominio` con el código de 000 §5 | Solo TypeScript y decimal.js. Nada de NestJS, Mongoose, amqplib ni jose |
| `src/aplicacion` | Un caso de uso por clase y los **puertos** (`aplicacion/puertos`) | `dominio` |
| `src/infraestructura` | Mongo (repositorios, `MongoUnidadDeTrabajo`, Outbox), AMQP (relay, consumidores), HTTP (controladores, middleware, filtro), Temporal, observabilidad | Todo |

## Reglas propias

- Todo caso de uso que cambia datos corre en `UnidadDeTrabajo.ejecutar(...)`; los eventos se dejan con `RegistroDeEventos.registrar(...)` dentro de ella (falla fuera de una transacción). El relay del worker los publica.
- Dos procesos con la misma imagen: `main.ts` (API, Cloud Run service) y `worker.ts` (relay, y en F4 Temporal y los consumidores; Cloud Run worker pool).
- Errores: lanzar `ErrorDeDominio(codigo, mensaje)`; `FiltroProblemas` arma el Problem Details.
- Dinero con `Monto` (nunca `number`); colecciones en camelCase plural (000 §9).
- Contrato primero: `src/infraestructura/http/contrato/flota.zod.ts` lo genera Orval desde `contratos/openapi/flota.yaml` (`npm run generar:contratos`) y **se versiona** (la imagen se construye sin `contratos/`). No se edita a mano; la CI falla si no coincide con el contrato. Los controladores validan entradas con esos esquemas y tipan sus respuestas con `z.infer`.

## Comandos

```bash
npm run verificar        # tipos, capas, unitarias e integración (Testcontainers: Mongo rs0 y RabbitMQ)
npm test                 # solo unitarias
npm run build && npm start   # API en 8102 contra el compose local (.env.example)
```

Con OrbStack, Testcontainers necesita `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock` y `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.
