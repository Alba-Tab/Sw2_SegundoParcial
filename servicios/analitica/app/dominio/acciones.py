"""Acción propuesta por el agente (spec 014): el agente propone, el despachador decide y el sistema ejecuta."""

from enum import StrEnum

from app.dominio.errores import ErrorDeDominio


class EstadoAccion(StrEnum):
    PENDIENTE = "PENDIENTE"
    APROBADA = "APROBADA"
    EJECUTADA = "EJECUTADA"
    RECHAZADA = "RECHAZADA"
    ARCHIVADA = "ARCHIVADA"


TIPOS = ("AVISAR_CLIENTE_RETRASO",)
MAX_POR_MISION = 3  # D86
MENSAJE_AGENTE = (20, 600)
MENSAJE_DESPACHADOR = (10, 1000)
MOTIVO_RECHAZO = 300
ARCHIVO_AUTOMATICO_HORAS = 24  # D87


def validar_mensaje(mensaje: str, limites: tuple[int, int]) -> str:
    texto = mensaje.strip()
    if not limites[0] <= len(texto) <= limites[1]:
        raise ErrorDeDominio("VALIDACION", f"El mensaje tiene de {limites[0]} a {limites[1]} caracteres", "mensaje")
    return texto


def decidir(estado: str, roles: set[str] | frozenset[str]) -> None:
    """Solo el despachador decide (el gerente solo mira, propuesta 7.2); solo una PENDIENTE."""
    if "despachador" not in roles:
        raise ErrorDeDominio("SIN_PERMISO", "Solo el despachador aprueba o rechaza acciones")
    if estado != EstadoAccion.PENDIENTE:
        raise ErrorDeDominio("CONFLICTO_ESTADO", f"La acción ya está {estado}")


def asunto(destino: str | None) -> str:
    return f"Su viaje a {destino or 'destino'} llegará con retraso"
