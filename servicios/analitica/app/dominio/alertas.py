"""Alertas del Centro de Control (spec 013, propuesta 5.14). Analítica es la única fuente."""

from dataclasses import dataclass
from enum import StrEnum

from app.dominio.errores import ErrorDeDominio


class TipoAlerta(StrEnum):
    ENTREGA_OBSERVADA = "ENTREGA_OBSERVADA"
    ENTREGA_RECHAZADA = "ENTREGA_RECHAZADA"
    VIAJE_REQUIERE_INTERVENCION = "VIAJE_REQUIERE_INTERVENCION"
    MANTENIMIENTO_REQUERIDO = "MANTENIMIENTO_REQUERIDO"
    CAIDA_COMBUSTIBLE = "CAIDA_COMBUSTIBLE"
    ANOMALIA_COMBUSTIBLE = "ANOMALIA_COMBUSTIBLE"
    RIESGO_RETRASO = "RIESGO_RETRASO"
    ACCION_PROPUESTA = "ACCION_PROPUESTA"


class EstadoAlerta(StrEnum):
    ABIERTA = "ABIERTA"
    ATENDIDA = "ATENDIDA"
    RESUELTA = "RESUELTA"


ROLES_INTERNOS = frozenset({"despachador", "jefe_flota", "administracion", "gerente"})


@dataclass(frozen=True)
class Regla:
    severidad: str
    roles: tuple[str, ...]
    entidad: str
    se_resuelve_sola: bool


# Tabla B de la spec 013: quién la ve, cuánto pesa y si el sistema la cierra solo.
REGLAS: dict[TipoAlerta, Regla] = {
    TipoAlerta.ENTREGA_OBSERVADA: Regla("MEDIA", ("despachador", "gerente"), "VIAJE", True),
    TipoAlerta.ENTREGA_RECHAZADA: Regla("ALTA", ("despachador", "administracion", "gerente"), "VIAJE", False),
    TipoAlerta.VIAJE_REQUIERE_INTERVENCION: Regla("CRITICA", ("despachador", "gerente"), "VIAJE", True),
    TipoAlerta.MANTENIMIENTO_REQUERIDO: Regla("MEDIA", ("jefe_flota", "gerente"), "UNIDAD", False),
    TipoAlerta.CAIDA_COMBUSTIBLE: Regla("ALTA", ("jefe_flota", "despachador", "gerente"), "UNIDAD", False),
    TipoAlerta.ANOMALIA_COMBUSTIBLE: Regla("MEDIA", ("jefe_flota", "gerente"), "CARGA", False),
    TipoAlerta.RIESGO_RETRASO: Regla("ALTA", ("despachador", "gerente"), "VIAJE", True),
    TipoAlerta.ACCION_PROPUESTA: Regla("MEDIA", ("despachador", "gerente"), "ACCION", True),
}

# Enlaces por URL a la app de cada rol (propuesta 6.1); las apps no se importan entre sí.
ENLACES: dict[str, str] = {
    "VIAJE": "/cc-operaciones/viajes/{id}",
    "UNIDAD": "/cc-flota/unidades/{id}",
    "CARGA": "/cc-flota/combustible/{id}",
    "ACCION": "/cc-operaciones/acciones/{id}",
}

LARGO_NOTA = 300

# Los tipos que el sistema cierra solos tienen una sola alerta viva (ABIERTA o ATENDIDA) por causa: una predicción o un
# evento nuevo actualiza la que ya existe aunque alguien la haya atendido (spec 013). La migración 0003 usa esta lista.
TIPOS_QUE_SE_RESUELVEN = tuple(t.value for t, r in REGLAS.items() if r.se_resuelve_sola)
ESTADOS_VIVOS = (EstadoAlerta.ABIERTA.value, EstadoAlerta.ATENDIDA.value)


def enlace(entidad: str, entidad_id: str) -> str:
    return ENLACES[entidad].format(id=entidad_id)


def visible_para(roles_alerta: list[str] | tuple[str, ...], roles_token: set[str]) -> bool:
    return bool(set(roles_alerta) & roles_token)


def validar_atencion(estado: str, roles_alerta: list[str], roles_token: set[str], nota: str | None) -> None:
    """Quién atiende: un rol de la alerta salvo gerente (solo lectura). Solo una ABIERTA pasa a ATENDIDA."""
    if nota is not None and len(nota) > LARGO_NOTA:
        raise ErrorDeDominio("VALIDACION", f"La nota tiene hasta {LARGO_NOTA} caracteres", "nota")
    if not (set(roles_alerta) - {"gerente"}) & roles_token:
        raise ErrorDeDominio("SIN_PERMISO", "Tu rol no puede atender esta alerta")
    if estado != EstadoAlerta.ABIERTA:
        raise ErrorDeDominio("CONFLICTO_ESTADO", f"La alerta está {estado}")
