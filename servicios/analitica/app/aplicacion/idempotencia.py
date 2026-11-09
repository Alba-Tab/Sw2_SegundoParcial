"""Idempotency-Key (000 §4.1): la tabla `operacion_idempotente` decide en la misma transacción que el cambio.

Misma clave y mismo cuerpo → la respuesta guardada; misma clave con otro cuerpo → 422 IDEMPOTENCIA_CUERPO_DISTINTO.
Dos peticiones simultáneas con la misma clave: la segunda espera el bloqueo de la fila y luego ve la guardada.
"""

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import OperacionIdempotente


def _texto(valor: Any) -> str:
    if isinstance(valor, datetime):
        return valor.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return f"{valor:.2f}"
    return str(valor)


def a_json(valor: Any) -> Any:
    """Fechas en ISO-8601 con Z, Decimal con 2 decimales y UUID como texto (lo que guarda y devuelve la API)."""
    return json.loads(json.dumps(valor, default=_texto))


def huella(cuerpo: Any) -> str:
    return hashlib.sha256(json.dumps(cuerpo, sort_keys=True, default=_texto).encode()).hexdigest()


def guardada(sesion: Session, clave: UUID, operacion: str, sub: str, cuerpo: Any) -> tuple[int, dict[str, Any]] | None:
    """La respuesta ya guardada para esa clave, o None. Otro cuerpo u otro `sub` → 422 IDEMPOTENCIA_CUERPO_DISTINTO."""
    previa = sesion.get(OperacionIdempotente, clave)
    if previa is None:
        return None
    if previa.hash_cuerpo != huella({"operacion": operacion, "cuerpo": cuerpo}) or previa.sub != sub:
        raise ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La misma Idempotency-Key se usó con otro cuerpo")
    return previa.status, previa.respuesta


def una_vez(
    sesion: Session,
    clave: UUID,
    operacion: str,
    sub: str,
    cuerpo: Any,
    hacer: Callable[[], tuple[int, dict[str, Any]]],
) -> tuple[int, dict[str, Any]]:
    # Serializa las peticiones con la misma clave dentro de esta transacción.
    sesion.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:c, 0))"), {"c": str(clave)})
    if previa := guardada(sesion, clave, operacion, sub, cuerpo):
        return previa
    h = huella({"operacion": operacion, "cuerpo": cuerpo})
    status, respuesta = hacer()
    respuesta = a_json(respuesta)
    sesion.add(
        OperacionIdempotente(
            clave=clave,
            operacion=operacion,
            sub=sub,
            hash_cuerpo=h,
            status=status,
            respuesta=respuesta,
            creada_en=datetime.now(UTC),
        )
    )
    return status, respuesta
