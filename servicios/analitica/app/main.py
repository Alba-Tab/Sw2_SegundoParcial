"""Analítica (FastAPI). `uvicorn app.main:app --port 8104`."""

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from app.api import errores
from app.api.limite import Limitador, LimiteCuerpo
from app.api.rutas_acciones import rutas as rutas_acciones
from app.api.rutas_agente import rutas as rutas_agente
from app.api.rutas_lectura import rutas as rutas_lectura
from app.api.rutas_reportes import rutas as rutas_reportes
from app.api.seguridad import usuario_actual
from app.aplicacion.agente import Agente
from app.aplicacion.proyecciones import Proyecciones
from app.aplicacion.voz import Voz
from app.configuracion import configuracion
from app.dominio.errores import ErrorDeDominio
from app.infraestructura import programador
from app.infraestructura.bd import motor
from app.infraestructura.llm import Llm
from app.infraestructura.mensajeria import ConsumidorEventos
from app.infraestructura.ml import cargar_modelos
from app.infraestructura.observabilidad import con_correlacion
from app.infraestructura.observabilidad import iniciar as iniciar_trazas
from app.infraestructura.relay import RelayOutbox
from app.infraestructura.tokens import Tokens

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# 000 §3: instantes en UTC con Z.
ENCODERS_BY_TYPE[datetime] = lambda d: d.astimezone(UTC).isoformat().replace("+00:00", "Z")


@asynccontextmanager
async def ciclo(app: FastAPI) -> AsyncIterator[None]:
    app.state.modelos = cargar_modelos(configuracion().modelos_dir)
    app.state.llm, tokens = Llm(), Tokens()
    app.state.agente = Agente(app.state.llm, tokens)
    app.state.voz = Voz(app.state.llm, tokens)
    app.state.limite_voz = Limitador(configuracion().voz_peticiones_por_minuto)
    consumidor = ConsumidorEventos(Proyecciones(app.state.modelos))
    app.state.consumidor = consumidor
    tarea = asyncio.create_task(consumidor.iniciar()) if configuracion().consumir_eventos else None
    relay = RelayOutbox()
    tarea_relay = asyncio.create_task(relay.correr()) if configuracion().publicar_outbox else None
    tareas = programador.iniciar(app) if configuracion().programar_tareas else None
    yield
    if tareas:
        tareas.shutdown(wait=False)
    await consumidor.detener()
    await relay.detener()
    pendientes = [t for t in (tarea, tarea_relay) if t]
    for t in pendientes:
        t.cancel()
    await asyncio.gather(*pendientes, return_exceptions=True)


# /docs y /openapi.json solo si se piden (DOCUMENTACION_API=true en local): no se sirven sin token (el contrato está
# en contratos/openapi/analitica.yaml).
_documentacion = configuracion().documentacion_api
app = FastAPI(
    title="Analítica",
    version="1.0.0",
    lifespan=ciclo,
    docs_url="/docs" if _documentacion else None,
    redoc_url=None,
    openapi_url="/openapi.json" if _documentacion else None,
)
errores.registrar(app)
iniciar_trazas(app, motor)
if configuracion().cors_origenes:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in configuracion().cors_origenes.split(",") if o.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-Id"],
    )
# Queda dentro de `autenticar_api`: primero el token (401) y después el tamaño del cuerpo (413).
app.add_middleware(LimiteCuerpo)


@app.middleware("http")
async def autenticar_api(request: Request, siguiente):  # type: ignore[no-untyped-def]
    """401/503 antes que 404 en /api/** (igual que Viajes y Flota): el token se valida antes de enrutar.

    El `correlationId` de la petición queda en el contexto: viaja al MCP y al LLM (`X-Correlation-Id`).
    """
    with con_correlacion(request.headers.get("x-correlation-id") or str(uuid.uuid4())):
        if request.url.path.startswith("/api/") and request.method != "OPTIONS":
            try:
                # Las llaves de Keycloak se bajan por red la primera vez: fuera del bucle de eventos.
                request.state.usuario = await run_in_threadpool(usuario_actual, request)
            except ErrorDeDominio as e:
                return errores.problema(request, e.codigo, e.mensaje)
        return await siguiente(request)


@app.get("/health")
def salud() -> dict[str, str]:
    return {"estado": "UP"}


@app.get("/health/ready")
def salud_lista(request: Request) -> JSONResponse:
    dependencias = {"postgres": "DOWN", "rabbitmq": "DOWN", "modelos": "DOWN"}
    try:
        with motor().connect() as c:
            c.execute(text("SELECT 1"))
        dependencias["postgres"] = "UP"
    except Exception:
        pass
    # `conectado` es el estado real: pasa a False apenas se cierra la conexión o el canal con RabbitMQ (FC5).
    consumidor = getattr(request.app.state, "consumidor", None)
    if not configuracion().consumir_eventos or (consumidor and consumidor.conectado):
        dependencias["rabbitmq"] = "UP"
    if getattr(request.app.state, "modelos", None) and request.app.state.modelos.cargados:
        dependencias["modelos"] = "UP"
    # Los modelos no tumban el servicio: sin ellos solo responden 503 las operaciones de ML.
    listo = dependencias["postgres"] == "UP" and dependencias["rabbitmq"] == "UP"
    return JSONResponse(
        {"estado": "UP" if listo else "DOWN", "dependencias": dependencias}, status_code=200 if listo else 503
    )


app.include_router(rutas_lectura)
app.include_router(rutas_reportes)
app.include_router(rutas_acciones)
app.include_router(rutas_agente)
