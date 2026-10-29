# PoC-2 Temporal en 3 lenguajes (rama de prueba, no se mergea)

Temporal 1.32.1 sobre PostgreSQL 17, con el workflow `ProgramarViaje` en Java y actividades en Java (Viajes), PHP (Finanzas) y TypeScript (Flota), según `contratos/temporal/`.

| Pieza | Versiones |
|---|---|
| Servidor | `temporalio/server:1.32.1`; esquema con `temporalio/admin-tools:1.32.1` (`temporal-sql-tool`, plugin `postgres12`); `postgres:17`; UI 2.57.0 en `localhost:8233` |
| viajes | Java 25 (Temurin), Temporal Java SDK 1.40.0, Jackson 3.1.7 (`tools.jackson`) con un `PayloadConverter` propio |
| finanzas | PHP 8.4.27, Laravel 13.39.0, `temporal/sdk` 2.20, RoadRunner 3.0.1 (plugins `temporal` y `service`) |
| flota | Node 24.22, `@temporalio/worker` 1.25.0; valida cada entrada con ajv contra el esquema del contrato |

```bash
docker compose -f plataforma/poc/temporal/compose.yaml up -d --build
plataforma/poc/temporal/escenarios.sh    # 24 pruebas: E1 a E7
docker compose -f plataforma/poc/temporal/compose.yaml down -v
```

Escenarios:
- **E1:** camino feliz y D43.
- **E2:** FS2, `CREDITO_INSUFICIENTE` desde PHP.
- **E3:** FS4, `SIN_UNIDAD_COMPATIBLE` desde TS, con la compensación.
- **E4:** FS5, worker de Flota apagado.
- **E5:** FS6, Flota y Viajes caídos a la mitad.
- **E6:** reinicio de la base de Finanzas para probar la reconexión de Laravel.
- **E7:** RoadRunner reinicia un servicio y un worker PHP muertos.

Resultados en `specs/poc-resultados.md`.
