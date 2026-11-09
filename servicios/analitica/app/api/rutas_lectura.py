"""Alertas, riesgo de retraso, anomalías y conducción (spec 013)."""

from datetime import date, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.seguridad import Usuario, exigir, usuario_actual
from app.aplicacion import alertas, consultas
from app.aplicacion.auditoria import auditar
from app.aplicacion.idempotencia import una_vez
from app.dominio.alertas import ROLES_INTERNOS, EstadoAlerta
from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import Alerta, transaccion

rutas = APIRouter(prefix="/api/v1")
UsuarioActual = Annotated[Usuario, Depends(usuario_actual)]


def alerta_json(a: Alerta) -> dict[str, Any]:
    return {
        "alertaId": str(a.alerta_id),
        "secuencia": a.secuencia,
        "tipo": a.tipo,
        "severidad": a.severidad,
        "roles": a.roles,
        "titulo": a.titulo,
        "detalle": a.detalle,
        "entidad": {"tipo": a.entidad_tipo, "id": a.entidad_id},
        "enlace": a.enlace,
        "estado": a.estado,
        "creadaEn": a.creada_en,
        "actualizadaEn": a.actualizada_en,
        "origen": a.origen,
        **({"atendidaPor": a.atendida_por} if a.atendida_por else {}),
        **({"nota": a.nota} if a.nota else {}),
    }


@rutas.get("/alertas")
def listar_alertas(
    usuario: UsuarioActual,
    cursor: Annotated[str | None, Query(max_length=500)] = None,
    estado: EstadoAlerta | None = None,
    limite: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    exigir(usuario, *ROLES_INTERNOS)
    with transaccion() as s:
        pagina = alertas.listar(
            s, set(usuario.roles), cursor, estado.value if estado else None, limite, consultas.ahora()
        )
        return {
            "alertas": [alerta_json(a) for a in pagina.alertas],
            "siguienteCursor": pagina.siguiente_cursor,
            "abiertas": pagina.abiertas,
            "datosAl": consultas.datos_al(s),
        }


class AtencionAlerta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nota: str | None = Field(default=None, max_length=300)


@rutas.post("/alertas/{alerta_id}/atencion")
def atender_alerta(
    alerta_id: UUID,
    cuerpo: AtencionAlerta,
    usuario: UsuarioActual,
    request: Request,
    idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
) -> JSONResponse:
    exigir(usuario, *ROLES_INTERNOS)

    def hacer() -> tuple[int, dict[str, Any]]:
        alerta = alertas.atender(s, alerta_id, usuario.sub, set(usuario.roles), cuerpo.nota)
        auditar(s, usuario.sub, usuario.rol, "alerta.atender", str(alerta_id), request, {"tipo": alerta.tipo})
        s.flush()
        return 200, alerta_json(alerta)

    with transaccion() as s:
        status, respuesta = una_vez(
            s, idempotency_key, "atenderAlerta", usuario.sub, {"alertaId": str(alerta_id), **cuerpo.model_dump()}, hacer
        )
    return JSONResponse(respuesta, status_code=status)


@rutas.get("/predicciones/retraso/{viaje_id}")
def obtener_riesgo(viaje_id: UUID, usuario: UsuarioActual, request: Request) -> dict[str, Any]:
    exigir(usuario, "despachador", "gerente", "agente_lectura")
    with transaccion() as s:
        return consultas.riesgo(s, request.app.state.modelos, viaje_id, consultas.ahora())


@rutas.get("/anomalias-combustible")
def listar_anomalias(
    usuario: UsuarioActual,
    desde: date,
    hasta: date | None = None,
    limite: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict[str, Any]:
    exigir(usuario, "jefe_flota", "gerente", "agente_lectura")
    if hasta and hasta < desde:
        raise ErrorDeDominio("VALIDACION", "hasta debe ser igual o posterior a desde", "hasta")
    if (hasta or consultas.hoy()) - desde > timedelta(days=366):
        raise ErrorDeDominio("VALIDACION", "El rango es de hasta 366 días", "desde")
    with transaccion() as s:
        return {"anomalias": consultas.anomalias(s, desde, hasta, limite)}


@rutas.get("/conduccion")
def listar_conduccion(
    usuario: UsuarioActual, choferId: UUID | None = None, desde: date | None = None
) -> dict[str, Any]:
    exigir(usuario, "jefe_flota", "gerente")
    with transaccion() as s:
        return consultas.conduccion(s, choferId, desde)
