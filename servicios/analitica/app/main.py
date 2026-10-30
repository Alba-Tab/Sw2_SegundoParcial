"""Analítica (FastAPI). `uvicorn app.main:app --port 8104`."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import errores
from app.api.rutas_lectura import rutas as rutas_lectura
from app.api.seguridad import usuario_actual
from app.aplicacion.proyecciones import Proyecciones
from app.configuracion import configuracion
from app.dominio.errores import ErrorDeDominio
from app.infraestructura import programador
from app.infraestructura.bd import motor
from app.infraestructura.mensajeria import ConsumidorEventos
from app.infraestructura.ml import cargar_modelos

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# 000 §3: instantes en UTC con Z.
ENCODERS_BY_TYPE[datetime] = lambda d: d.astimezone(UTC).isoformat().replace("+00:00", "Z")


@asynccontextmanager
async def ciclo(app: FastAPI) -> AsyncIterator[None]:
    app.state.modelos = cargar_modelos(configuracion().modelos_dir)
    consumidor = ConsumidorEventos(Proyecciones(app.state.modelos))
    app.state.consumidor = consumidor
    tarea = asyncio.create_task(consumidor.iniciar()) if configuracion().consumir_eventos else None
    tareas = programador.iniciar(app) if configuracion().programar_tareas else None
    yield
    if tareas:
        tareas.shutdown(wait=False)
    if tarea:
        tarea.cancel()
    await consumidor.detener()


app = FastAPI(title="Analítica", version="1.0.0", lifespan=ciclo)
errores.registrar(app)
if configuracion().cors_origenes:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in configuracion().cors_origenes.split(",") if o.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-Id"],
    )


@app.middleware("http")
async def autenticar_api(request: Request, siguiente):  # type: ignore[no-untyped-def]
    """401/503 antes que 404 en /api/** (igual que Viajes y Flota): el token se valida antes de enrutar."""
    if request.url.path.startswith("/api/") and request.method != "OPTIONS":
        try:
            request.state.usuario = usuario_actual(request)
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
