"""Variables de la predicción de retraso (D79) y su etiqueta de entrenamiento (D80)."""

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ZONA = ZoneInfo("America/La_Paz")
VELOCIDAD_PLANIFICADA_KMH = 55
HORA_SALIDA = time(7, 0)
UMBRAL_RIESGO = 0.70
FACTOR_RETRASADO = 1.25
VELOCIDAD_DETENIDO_KMH = 3.0

NUMERICAS = (
    "distanciaKm",
    "fraccionRecorrida",
    "horasTranscurridas",
    "horasPlanificadas",
    "retrasoSalidaHoras",
    "bloqueos",
    "fallas",
    "minutosDetenido",
    "toneladas",
)
CATEGORICAS = ("tipoCarga",)
TIPOS_CARGA = ("GRANOS", "INSUMOS", "INSUMOS_LIQUIDOS", "CONTENEDOR")

NOMBRES = {
    "distanciaKm": "Distancia de la ruta",
    "fraccionRecorrida": "Avance del recorrido",
    "horasTranscurridas": "Horas en ruta",
    "horasPlanificadas": "Horas planificadas",
    "retrasoSalidaHoras": "Salida tardía",
    "bloqueos": "Bloqueos en la bitácora",
    "fallas": "Fallas mecánicas",
    "minutosDetenido": "Minutos detenido en la última hora",
    "toneladas": "Toneladas",
    "tipoCarga": "Tipo de carga",
}


def metros(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def minutos_detenido(puntos: list[tuple[datetime, float]], hasta: datetime) -> float:
    """Minutos de la última hora (hasta `hasta`) en que el camión iba a menos de 3 km/h, de 0 a 60."""
    desde = hasta - timedelta(hours=1)
    ordenados = sorted(p for p in puntos if p[0] <= hasta)
    if not ordenados:
        return 0.0
    total = 0.0
    for (t1, v1), (t2, _) in zip(ordenados, [*ordenados[1:], (hasta, 0.0)], strict=True):
        inicio, fin = max(t1, desde), min(t2, hasta)
        if fin > inicio and v1 < VELOCIDAD_DETENIDO_KMH:
            total += (fin - inicio).total_seconds() / 60
    return round(min(60.0, total), 1)


@dataclass(frozen=True)
class DatosViaje:
    distancia_km: float
    origen: tuple[float, float] | None
    destino: tuple[float, float] | None
    ultima_posicion: tuple[float, float] | None
    iniciado_en: datetime
    fecha_viaje: date | None
    bloqueos: int
    fallas: int
    toneladas: float
    tipo_carga: str
    puntos: list[tuple[datetime, float]]


def variables(v: DatosViaje, ahora: datetime) -> dict[str, float | str]:
    """D79. `ahora` es la última posición conocida (el simulador retrotrae el GPS) o el reloj."""
    fraccion = 0.0
    if v.destino and v.ultima_posicion and v.distancia_km > 0:
        restante_km = metros(*v.ultima_posicion, *v.destino) / 1000
        fraccion = max(0.0, min(1.0, 1 - restante_km / v.distancia_km))
    salida_plan = datetime.combine(v.fecha_viaje or v.iniciado_en.astimezone(ZONA).date(), HORA_SALIDA, ZONA)
    return {
        "distanciaKm": float(v.distancia_km),
        "fraccionRecorrida": round(fraccion, 3),
        "horasTranscurridas": round(max(0.0, (ahora - v.iniciado_en).total_seconds() / 3600), 2),
        "horasPlanificadas": round(v.distancia_km / VELOCIDAD_PLANIFICADA_KMH, 2),
        "retrasoSalidaHoras": round((v.iniciado_en - salida_plan).total_seconds() / 3600, 2),
        "bloqueos": v.bloqueos,
        "fallas": v.fallas,
        "minutosDetenido": minutos_detenido(v.puntos, ahora),
        "toneladas": float(v.toneladas),
        "tipoCarga": v.tipo_carga if v.tipo_carga in TIPOS_CARGA else "GRANOS",
    }


def retrasado(horas_reales: float, distancia_km: float) -> bool:
    """D80: la duración real supera 1,25 veces la planificada."""
    return horas_reales > FACTOR_RETRASADO * distancia_km / VELOCIDAD_PLANIFICADA_KMH
