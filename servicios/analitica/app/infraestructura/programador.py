"""Tareas periódicas (APScheduler, una sola réplica: maxReplicas = 1, T11.5)."""

import logging
from datetime import UTC, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

from app.aplicacion import exportaciones, prediccion
from app.infraestructura.bd import transaccion

log = logging.getLogger(__name__)


def recalcular_pendientes(app: FastAPI) -> None:
    """Viajes en ruta cuyos eventos llegaron dentro del minuto de espera (D78) se recalculan aquí."""
    with transaccion() as s:
        for viaje_id in prediccion.pendientes(s):
            prediccion.recalcular_riesgo(s, app.state.modelos, viaje_id, datetime.now(UTC), forzar=True)


def purgar_exportaciones() -> None:
    """Spec 015, paso 12: cada 5 min se borran las exportaciones vencidas."""
    with transaccion() as s:
        if n := exportaciones.purgar(s, datetime.now(UTC)):
            log.info("Exportaciones vencidas borradas: %s", n)


def iniciar(app: FastAPI) -> BackgroundScheduler:
    tareas = BackgroundScheduler(timezone="UTC", job_defaults={"coalesce": True, "max_instances": 1})
    tareas.add_job(recalcular_pendientes, "interval", seconds=60, args=[app], id="riesgo-pendiente")
    tareas.add_job(purgar_exportaciones, "interval", minutes=5, id="purgar-exportaciones")
    tareas.start()
    return tareas
