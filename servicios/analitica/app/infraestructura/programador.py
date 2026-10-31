"""Tareas periódicas (APScheduler, una sola réplica: maxReplicas = 1, T11.5)."""

import asyncio
import logging
from datetime import UTC, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

from app.aplicacion import acciones, agente, exportaciones, prediccion
from app.configuracion import configuracion
from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import transaccion

log = logging.getLogger(__name__)


def recalcular_pendientes(app: FastAPI) -> None:
    """Viajes en ruta cuyos eventos llegaron dentro del minuto de espera (D78) se recalculan aquí.

    Sin forzar: si el último cálculo tiene menos de 1 min, ese viaje espera a la vuelta siguiente. Una transacción por
    viaje, así el bloqueo de las alertas no se guarda mientras se toman las filas de otro viaje.
    """
    with transaccion() as s:
        viajes = prediccion.pendientes(s)
    for viaje_id in viajes:
        with transaccion() as s:
            prediccion.recalcular_riesgo(s, app.state.modelos, viaje_id, datetime.now(UTC))


def purgar_exportaciones() -> None:
    """Spec 015, paso 12: cada 5 min se borran las exportaciones vencidas."""
    with transaccion() as s:
        if n := exportaciones.purgar(s, datetime.now(UTC)):
            log.info("Exportaciones vencidas borradas: %s", n)


def archivar_acciones() -> None:
    """D87: PENDIENTE sin decisión en 24 h, o cuyo viaje terminó, pasa a ARCHIVADA."""
    with transaccion() as s:
        if n := acciones.archivar(s, datetime.now(UTC)):
            log.info("Acciones archivadas: %s", n)


def mision_programada(app: FastAPI) -> None:
    """Spec 014, paso 1: cada 10 min. Si hay una EN_CURSO se omite; sin LLM queda SALTADA (FR4)."""

    async def correr() -> None:
        if not await app.state.llm.disponible():
            agente.saltar("PROGRAMADA", None, "LLM_NO_DISPONIBLE")
            return
        try:
            mision_id = agente.abrir("PROGRAMADA", None)
        except ErrorDeDominio:
            return
        log.info("Misión programada %s: %s", mision_id, await app.state.agente.correr(mision_id))

    asyncio.run(correr())


def iniciar(app: FastAPI) -> BackgroundScheduler:
    tareas = BackgroundScheduler(timezone="UTC", job_defaults={"coalesce": True, "max_instances": 1})
    tareas.add_job(recalcular_pendientes, "interval", seconds=60, args=[app], id="riesgo-pendiente")
    tareas.add_job(purgar_exportaciones, "interval", minutes=5, id="purgar-exportaciones")
    tareas.add_job(archivar_acciones, "interval", minutes=5, id="archivar-acciones")
    if configuracion().mision_cada_minutos > 0:
        tareas.add_job(
            mision_programada, "interval", minutes=configuracion().mision_cada_minutos, args=[app], id="mision-agente"
        )
    tareas.start()
    return tareas
