"""Alertas: se abren desde eventos, ML y el agente; se listan por roles con cursor; se atienden (spec 013)."""

import base64
import binascii
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.dominio.alertas import (
    ESTADOS_VIVOS,
    REGLAS,
    TIPOS_QUE_SE_RESUELVEN,
    EstadoAlerta,
    TipoAlerta,
    enlace,
    validar_atencion,
)
from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import Alerta
from app.infraestructura.observabilidad import tramo

RETENCION_CAMPANA = timedelta(hours=24)
# pg_advisory_xact_lock: las alertas se crean de a una, así el orden de `secuencia` es el orden de confirmación y el
# cursor del Gateway no salta una que se confirmó después que otra de secuencia mayor (spec 013, paso 10).
BLOQUEO_ALERTAS = 4_201_313


def abrir(
    sesion: Session, tipo: TipoAlerta, entidad_id: str, titulo: str, detalle: str, origen: str, ahora: datetime
) -> UUID:
    """Una alerta por causa (tipo, entidad): si ya hay una, se actualiza su detalle y no se crea otra.

    Para los tipos que se resuelven solos cuenta también la ATENDIDA: una predicción nueva no abre otra (spec 013).
    """
    regla = REGLAS[tipo]
    sesion.execute(text("SELECT pg_advisory_xact_lock(:b)"), {"b": BLOQUEO_ALERTAS})
    fila = {
        "alerta_id": uuid4(),
        "tipo": tipo.value,
        "severidad": regla.severidad,
        "roles": list(regla.roles),
        "titulo": titulo[:200],
        "detalle": detalle,
        "entidad_tipo": regla.entidad,
        "entidad_id": entidad_id,
        "enlace": enlace(regla.entidad, entidad_id),
        "estado": EstadoAlerta.ABIERTA.value,
        "origen": origen[:80],
        "creada_en": ahora,
        "actualizada_en": ahora,
    }
    # El mismo predicado que el índice único parcial de cada caso (migraciones 0001 y 0003).
    viva = (
        and_(Alerta.estado.in_(ESTADOS_VIVOS), Alerta.tipo.in_(TIPOS_QUE_SE_RESUELVEN))
        if regla.se_resuelve_sola
        else Alerta.estado == EstadoAlerta.ABIERTA.value
    )
    sentencia = (
        insert(Alerta)
        .values(fila)
        .on_conflict_do_update(
            index_elements=["tipo", "entidad_id"],
            index_where=viva,
            set_={"titulo": fila["titulo"], "detalle": detalle, "actualizada_en": ahora},
        )
        .returning(Alerta.alerta_id)
    )
    with tramo(f"alerta {tipo.value}", entidad=entidad_id):
        return sesion.execute(sentencia).scalar_one()


def resolver(sesion: Session, tipo: TipoAlerta, entidad_id: str, ahora: datetime) -> int:
    """La causa terminó: ABIERTA o ATENDIDA → RESUELTA (solo los tipos que se resuelven solos)."""
    if not REGLAS[tipo].se_resuelve_sola:
        return 0
    r = sesion.execute(
        update(Alerta)
        .where(
            Alerta.tipo == tipo.value,
            Alerta.entidad_id == entidad_id,
            Alerta.estado.in_([EstadoAlerta.ABIERTA.value, EstadoAlerta.ATENDIDA.value]),
        )
        .values(estado=EstadoAlerta.RESUELTA.value, actualizada_en=ahora)
    )
    return r.rowcount or 0


def codificar_cursor(secuencia: int) -> str:
    return base64.urlsafe_b64encode(f"s:{secuencia}".encode()).decode().rstrip("=")


def decodificar_cursor(cursor: str) -> int:
    try:
        texto = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        if not texto.startswith("s:"):
            raise ValueError
        return int(texto[2:])
    except (ValueError, binascii.Error, UnicodeDecodeError) as e:
        raise ErrorDeDominio("VALIDACION", "Cursor inválido", "cursor") from e


@dataclass
class Pagina:
    alertas: list[Alerta]
    siguiente_cursor: str | None
    abiertas: int


def listar(
    sesion: Session, roles: set[str], cursor: str | None, estado: str | None, limite: int, ahora: datetime
) -> Pagina:
    """Solo las alertas que comparten un rol con el token, en orden de secuencia (paso 10 de la spec 013)."""
    visibles = Alerta.roles.overlap(sorted(roles))
    consulta = select(Alerta).where(visibles)
    if cursor:
        consulta = consulta.where(Alerta.secuencia > decodificar_cursor(cursor))
    if estado:
        consulta = consulta.where(Alerta.estado == estado)
    elif not cursor:
        # La campana: las abiertas y las cerradas de las últimas 24 h (D83).
        consulta = consulta.where(
            or_(Alerta.estado == EstadoAlerta.ABIERTA.value, Alerta.actualizada_en >= ahora - RETENCION_CAMPANA)
        )
    filas = list(sesion.scalars(consulta.order_by(Alerta.secuencia).limit(limite)))
    abiertas = sesion.scalar(
        select(func.count()).select_from(Alerta).where(visibles, Alerta.estado == EstadoAlerta.ABIERTA.value)
    )
    ultimo = filas[-1].secuencia if filas else (decodificar_cursor(cursor) if cursor else None)
    return Pagina(filas, codificar_cursor(ultimo) if ultimo is not None else None, abiertas or 0)


def atender(sesion: Session, alerta_id: UUID, sub: str, roles: set[str], nota: str | None) -> Alerta:
    alerta = sesion.get(Alerta, alerta_id, with_for_update=True)
    if alerta is None or not set(alerta.roles) & roles:
        raise ErrorDeDominio("NO_ENCONTRADO", "La alerta no existe")
    validar_atencion(alerta.estado, alerta.roles, roles, nota)
    alerta.estado = EstadoAlerta.ATENDIDA.value
    alerta.atendida_por = sub
    alerta.nota = nota
    alerta.actualizada_en = datetime.now(UTC)
    return alerta
