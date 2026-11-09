"""Auditoría de 000 §9: una fila por acción de una persona o del agente, en la misma transacción."""

from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.infraestructura.bd import Auditoria


class ConCabeceras(Protocol):
    @property
    def headers(self) -> Any: ...


def auditar(
    s: Session,
    sub: str,
    rol: str | None,
    accion: str,
    entidad_id: str | None,
    peticion: ConCabeceras | None,
    datos: dict[str, Any],
) -> None:
    s.add(
        Auditoria(
            ocurrido_en=datetime.now(UTC),
            actor_sub=sub,
            actor_rol=rol,
            accion=accion,
            entidad_id=entidad_id,
            correlation_id=peticion.headers.get("x-correlation-id") if peticion else None,
            datos=datos,
        )
    )
