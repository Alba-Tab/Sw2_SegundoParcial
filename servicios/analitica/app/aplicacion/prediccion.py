"""Riesgo de retraso (spec 013, C): se recalcula como máximo una vez por minuto por viaje (D78)."""

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.aplicacion import alertas
from app.aplicacion.puertos import Modelos, Prediccion
from app.dominio.alertas import TipoAlerta
from app.dominio.retraso import UMBRAL_RIESGO, DatosViaje, variables
from app.infraestructura.bd import HechoViaje, PosicionViaje, PrediccionRetraso, Ruta
from app.infraestructura.observabilidad import tramo

INTERVALO = timedelta(minutes=1)
VIGENCIA_AGENTE = timedelta(minutes=5)


def datos_del_viaje(s: Session, viaje: HechoViaje) -> DatosViaje | None:
    ruta = s.get(Ruta, viaje.ruta_id) if viaje.ruta_id else None
    if ruta is None or viaje.iniciado_en is None:
        return None
    puntos = s.execute(
        select(PosicionViaje.registrada_en, PosicionViaje.velocidad_kmh).where(PosicionViaje.viaje_id == viaje.viaje_id)
    ).all()
    return DatosViaje(
        distancia_km=float(ruta.distancia_km),
        origen=(ruta.origen_lat, ruta.origen_lng) if ruta.origen_lat is not None else None,
        destino=(ruta.destino_lat, ruta.destino_lng) if ruta.destino_lat is not None else None,
        ultima_posicion=(viaje.ultima_lat, viaje.ultima_lng) if viaje.ultima_lat is not None else None,
        iniciado_en=viaje.iniciado_en,
        fecha_viaje=viaje.fecha_viaje,
        bloqueos=viaje.bloqueos,
        fallas=viaje.fallas,
        toneladas=float(viaje.toneladas or 0),
        tipo_carga=viaje.tipo_carga or "GRANOS",
        puntos=[(t, v) for t, v in puntos],
    )


def recalcular_riesgo(
    s: Session, modelos: Modelos, viaje_id: UUID, ahora: datetime, forzar: bool = False
) -> PrediccionRetraso | None:
    viaje = s.get(HechoViaje, viaje_id)
    if viaje is None or viaje.estado != "EN_RUTA":
        return None
    previa = s.get(PrediccionRetraso, viaje_id)
    if previa and not forzar and ahora - previa.calculada_en < INTERVALO:
        return previa
    datos = datos_del_viaje(s, viaje)
    if datos is None:
        return previa
    # El simulador retrotrae el GPS: el "ahora" del viaje es su última posición si es más nueva que el reloj.
    referencia = max(ahora, viaje.ultima_posicion_en) if viaje.ultima_posicion_en else ahora
    with tramo("predecir retraso", viaje=viaje_id) as span:
        resultado: Prediccion | None = modelos.retraso(variables(datos, referencia))
        if resultado is not None:
            span.set_attribute("probabilidad", resultado.probabilidad)
    if resultado is None:
        return previa
    fila = {
        "viaje_id": viaje_id,
        "probabilidad": round(resultado.probabilidad, 4),
        "calculada_en": ahora,
        "modelo_version": resultado.version,
        "factores": resultado.factores,
    }
    s.execute(insert(PrediccionRetraso).values(fila).on_conflict_do_update(index_elements=["viaje_id"], set_=fila))
    if resultado.probabilidad >= UMBRAL_RIESGO:
        nombres = ", ".join(str(f["nombre"]).lower() for f in resultado.factores) or "sin factores"
        alertas.abrir(
            s,
            TipoAlerta.RIESGO_RETRASO,
            str(viaje_id),
            f"Riesgo de retraso {round(resultado.probabilidad * 100)} %" + (f" · {viaje.placa}" if viaje.placa else ""),
            f"Probabilidad {resultado.probabilidad:.2f} (umbral {UMBRAL_RIESGO:.2f}). Pesan: {nombres}.",
            f"modelo:{resultado.version}",
            ahora,
        )
    return s.get(PrediccionRetraso, viaje_id)


def pendientes(s: Session) -> list[UUID]:
    """Viajes en ruta con eventos más nuevos que su última predicción (el límite de 1 por minuto los dejó atrás)."""
    consulta = (
        select(HechoViaje.viaje_id)
        .outerjoin(PrediccionRetraso, PrediccionRetraso.viaje_id == HechoViaje.viaje_id)
        .where(
            HechoViaje.estado == "EN_RUTA",
            (PrediccionRetraso.viaje_id.is_(None)) | (PrediccionRetraso.calculada_en < HechoViaje.actualizado_en),
        )
    )
    return list(s.scalars(consulta))
