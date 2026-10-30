"""Acciones propuestas por el agente (spec 014, CU-18)."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.seguridad import Usuario, exigir, usuario_actual
from app.aplicacion import acciones
from app.aplicacion.alertas import codificar_cursor, decodificar_cursor
from app.aplicacion.auditoria import auditar
from app.aplicacion.consultas import ahora
from app.aplicacion.idempotencia import una_vez
from app.dominio.acciones import EstadoAccion
from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import AccionPropuesta, Cliente, transaccion

rutas = APIRouter(prefix="/api/v1")
UsuarioActual = Annotated[Usuario, Depends(usuario_actual)]
Clave = Annotated[UUID, Header(alias="Idempotency-Key")]


class Evidencia(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fuente: str = Field(max_length=60)
    referencia: str = Field(max_length=100)
    resumen: str = Field(max_length=300)


class Destinatario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clienteId: UUID


class AccionNueva(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: Literal["AVISAR_CLIENTE_RETRASO"]
    viajeId: UUID
    destinatario: Destinatario
    mensaje: str = Field(min_length=20, max_length=600)
    evidencia: list[Evidencia] = Field(min_length=1, max_length=5)


class Aprobacion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mensaje: str = Field(min_length=10, max_length=1000)


class Rechazo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str | None = Field(default=None, max_length=300)


@rutas.get("/acciones")
def listar_acciones(
    usuario: UsuarioActual,
    estado: EstadoAccion | None = None,
    cursor: Annotated[str | None, Query(max_length=500)] = None,
    limite: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    exigir(usuario, "despachador", "gerente")
    antes = datetime.fromtimestamp(decodificar_cursor(cursor) / 1_000_000).astimezone() if cursor else None
    with transaccion() as s:
        filas = acciones.listar(s, estado.value if estado else None, limite, antes)
        ultimo = filas[-1][0].creada_en if len(filas) == limite else None
        return {
            "acciones": [acciones.accion_json(a, r) for a, r in filas],
            "siguienteCursor": codificar_cursor(int(ultimo.timestamp() * 1_000_000)) if ultimo else None,
        }


@rutas.get("/acciones/{accion_id}")
def obtener_accion(accion_id: UUID, usuario: UsuarioActual) -> dict[str, Any]:
    exigir(usuario, "despachador", "gerente")
    with transaccion() as s:
        a = s.get(AccionPropuesta, accion_id)
        if a is None:
            raise ErrorDeDominio("NO_ENCONTRADO", "La acción no existe")
        cliente = s.get(Cliente, a.cliente_id)
        return acciones.accion_json(a, cliente.razon_social if cliente else None)


@rutas.post("/acciones")
def crear_accion(
    cuerpo: AccionNueva,
    usuario: UsuarioActual,
    request: Request,
    clave: Clave,
    mision: Annotated[UUID | None, Header(alias="X-Mision-Id")] = None,
) -> JSONResponse:
    exigir(usuario, "agente_lectura")
    datos = cuerpo.model_dump(mode="json")

    def hacer() -> tuple[int, dict[str, Any]]:
        creada, r = acciones.proponer(s, datos, mision, ahora())
        auditar(
            s,
            usuario.sub,
            usuario.rol,
            "accion.proponer",
            r["accionId"],
            request,
            {"viajeId": datos["viajeId"], "creada": creada},
        )
        return (201 if creada else 200), r

    with transaccion() as s:
        status, respuesta = una_vez(s, clave, "crearAccionPropuesta", usuario.sub, datos, hacer)
    return JSONResponse(respuesta, status_code=status)


@rutas.post("/acciones/{accion_id}/aprobacion")
def aprobar_accion(
    accion_id: UUID, cuerpo: Aprobacion, usuario: UsuarioActual, request: Request, clave: Clave
) -> JSONResponse:
    def hacer() -> tuple[int, dict[str, Any]]:
        a = acciones.aprobar(
            s, accion_id, cuerpo.mensaje, usuario.sub, usuario.roles, request.headers.get("x-correlation-id"), ahora()
        )
        auditar(s, usuario.sub, usuario.rol, "accion.aprobar", str(accion_id), request, {"tipo": a.tipo})
        return 200, acciones.accion_json(a)

    with transaccion() as s:
        status, respuesta = una_vez(
            s, clave, "aprobarAccion", usuario.sub, {"accionId": str(accion_id), **cuerpo.model_dump()}, hacer
        )
    return JSONResponse(respuesta, status_code=status)


@rutas.post("/acciones/{accion_id}/rechazo")
def rechazar_accion(
    accion_id: UUID, cuerpo: Rechazo, usuario: UsuarioActual, request: Request, clave: Clave
) -> JSONResponse:
    def hacer() -> tuple[int, dict[str, Any]]:
        a = acciones.rechazar(s, accion_id, cuerpo.motivo, usuario.sub, usuario.roles, ahora())
        auditar(s, usuario.sub, usuario.rol, "accion.rechazar", str(accion_id), request, {"tipo": a.tipo})
        return 200, acciones.accion_json(a)

    with transaccion() as s:
        status, respuesta = una_vez(
            s, clave, "rechazarAccion", usuario.sub, {"accionId": str(accion_id), **cuerpo.model_dump()}, hacer
        )
    return JSONResponse(respuesta, status_code=status)
