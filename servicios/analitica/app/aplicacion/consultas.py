"""Consultas del modelo de lectura que no son reportes: riesgo, anomalías, conducción y `datosAl`."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.aplicacion.prediccion import VIGENCIA_AGENTE, recalcular_riesgo
from app.aplicacion.puertos import Modelos
from app.configuracion import ZONA
from app.dominio.conduccion import puntaje
from app.dominio.errores import ErrorDeDominio
from app.dominio.retraso import UMBRAL_RIESGO
from app.infraestructura.bd import (
    Chofer,
    EstadoLectura,
    HechoCombustible,
    HechoConduccion,
    HechoViaje,
    PrediccionRetraso,
)


def datos_al(s: Session) -> datetime | None:
    return s.scalar(select(EstadoLectura.datos_al).where(EstadoLectura.id == 1))


def hoy() -> date:
    return datetime.now(ZONA).date()


def riesgo(s: Session, modelos: Modelos, viaje_id: UUID, ahora: datetime) -> dict[str, Any]:
    viaje = s.get(HechoViaje, viaje_id)
    if viaje is None:
        raise ErrorDeDominio("NO_ENCONTRADO", "Analítica no conoce ese viaje")
    previa = s.get(PrediccionRetraso, viaje_id)
    if previa is None or ahora - previa.calculada_en > VIGENCIA_AGENTE:
        previa = recalcular_riesgo(s, modelos, viaje_id, ahora, forzar=True) or previa
    if previa is None:
        if viaje.estado != "EN_RUTA":
            raise ErrorDeDominio("NO_ENCONTRADO", f"El viaje está {viaje.estado}: no tiene predicción")
        raise ErrorDeDominio("MODELO_NO_DISPONIBLE", "El modelo de retraso no está cargado")
    return {
        "viajeId": str(viaje_id),
        "probabilidad": previa.probabilidad,
        "umbral": UMBRAL_RIESGO,
        "enRiesgo": previa.probabilidad >= UMBRAL_RIESGO,
        "calculadaEn": previa.calculada_en,
        "modeloVersion": previa.modelo_version,
        "factores": previa.factores[:3],
    }


def anomalias(s: Session, desde: date, hasta: date | None, limite: int) -> list[dict[str, Any]]:
    inicio = datetime.combine(desde, time.min, ZONA)
    fin = datetime.combine((hasta or hoy()) + timedelta(days=1), time.min, ZONA)
    filas = s.scalars(
        select(HechoCombustible)
        .where(
            HechoCombustible.es_anomalia, HechoCombustible.registrada_en >= inicio, HechoCombustible.registrada_en < fin
        )
        .order_by(HechoCombustible.registrada_en.desc())
        .limit(limite)
    )
    return [
        {
            "cargaId": str(c.carga_id),
            "placa": c.placa,
            **({"viajeId": str(c.viaje_id)} if c.viaje_id else {}),
            "litros": float(c.litros),
            "kmPorLitro": float(c.km_por_litro or 0),
            "puntaje": round(c.puntaje_anomalia or 0, 4),
            "registradaEn": c.registrada_en,
        }
        for c in filas
    ]


def conduccion(s: Session, chofer_id: UUID | None, desde: date | None) -> dict[str, Any]:
    """D84 por viaje y por chofer en la semana: frenadas y fatigas sobre los km de los viajes terminados o en curso."""
    desde = desde or hoy() - timedelta(days=6)
    hasta = desde + timedelta(days=6)
    inicio = datetime.combine(desde, time.min, ZONA)
    fin = datetime.combine(hasta + timedelta(days=1), time.min, ZONA)
    eventos = (
        select(
            HechoConduccion.viaje_id,
            HechoConduccion.chofer_id,
            func.count().filter(HechoConduccion.tipo == "FRENADA_BRUSCA").label("frenadas"),
            func.count().filter(HechoConduccion.tipo == "ALERTA_FATIGA").label("fatigas"),
        )
        .where(HechoConduccion.registrado_en >= inicio, HechoConduccion.registrado_en < fin)
        .group_by(HechoConduccion.viaje_id, HechoConduccion.chofer_id)
    )
    if chofer_id:
        eventos = eventos.where(HechoConduccion.chofer_id == chofer_id)
    sub = eventos.subquery()
    filas = s.execute(
        select(sub, HechoViaje.km_recorridos, Chofer.nombre)
        .outerjoin(HechoViaje, HechoViaje.viaje_id == sub.c.viaje_id)
        .outerjoin(Chofer, Chofer.chofer_id == sub.c.chofer_id)
    ).all()
    viajes, choferes = [], {}
    for f in filas:
        km = float(f.km_recorridos or 0)
        viajes.append(
            {
                "viajeId": str(f.viaje_id),
                "choferId": str(f.chofer_id),
                "nombre": f.nombre,
                "frenadas": f.frenadas,
                "fatigas": f.fatigas,
                "km": km,
                "puntaje": puntaje(f.frenadas, f.fatigas, km),
            }
        )
        c = choferes.setdefault(
            str(f.chofer_id), {"choferId": str(f.chofer_id), "nombre": f.nombre, "frenadas": 0, "fatigas": 0, "km": 0.0}
        )
        c["frenadas"] += f.frenadas
        c["fatigas"] += f.fatigas
        c["km"] += km
    for c in choferes.values():
        c["puntaje"] = puntaje(c["frenadas"], c["fatigas"], c["km"])
    return {
        "desde": desde,
        "hasta": hasta,
        "choferes": sorted(choferes.values(), key=lambda c: c["puntaje"]),
        "viajes": sorted(viajes, key=lambda v: v["puntaje"]),
        "datosAl": datos_al(s),
    }


def ahora() -> datetime:
    return datetime.now(UTC)
