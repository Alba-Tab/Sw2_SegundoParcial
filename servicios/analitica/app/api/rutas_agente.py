"""Misiones del agente (spec 014) y consulta por voz con su plan B de dos saltos (spec 015)."""

import asyncio
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.api.seguridad import Usuario, exigir, usuario_actual
from app.aplicacion import agente
from app.aplicacion.auditoria import auditar
from app.aplicacion.idempotencia import guardada, una_vez
from app.aplicacion.voz import ROLES_VOZ, Voz
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import CATALOGO, MAX_FILAS_PANTALLA, ReporteId
from app.infraestructura.bd import Mision, transaccion
from app.infraestructura.llm import Llm

rutas = APIRouter(prefix="/api/v1")
UsuarioActual = Annotated[Usuario, Depends(usuario_actual)]
_misiones: set[asyncio.Task] = set()


@rutas.get("/agente/misiones")
def listar_misiones(usuario: UsuarioActual, limite: Annotated[int, Query(ge=1, le=100)] = 20) -> dict[str, Any]:
    exigir(usuario, "despachador", "gerente")
    with transaccion() as s:
        filas = s.scalars(select(Mision).order_by(Mision.iniciada_en.desc()).limit(limite))
        return {"misiones": [agente.mision_json(m) for m in filas]}


@rutas.get("/agente/misiones/{mision_id}")
def obtener_mision(mision_id: UUID, usuario: UsuarioActual) -> dict[str, Any]:
    exigir(usuario, "despachador", "gerente")
    with transaccion() as s:
        m = s.get(Mision, mision_id)
        if m is None:
            raise ErrorDeDominio("NO_ENCONTRADO", "La misión no existe")
        return agente.mision_json(m)


def _respuesta_mision(status: int, respuesta: dict[str, Any]) -> JSONResponse:
    return JSONResponse(
        respuesta, status_code=status, headers={"Location": f"/api/v1/agente/misiones/{respuesta['misionId']}"}
    )


@rutas.post("/agente/misiones")
async def disparar_mision(
    usuario: UsuarioActual, request: Request, clave: Annotated[UUID, Header(alias="Idempotency-Key")]
) -> JSONResponse:
    """202 con `{misionId}`; 409 si hay una EN_CURSO; 503 LLM_NO_DISPONIBLE y misión SALTADA si el LLM no responde (FR4)."""
    exigir(usuario, "despachador", "gerente")

    def ya_hecha() -> tuple[int, dict[str, Any]] | None:
        with transaccion() as s:
            return guardada(s, clave, "dispararMision", usuario.sub, {})

    # Un reintento con la misma clave devuelve la misión que ya se disparó, aunque ahora el LLM no responda.
    if previa := await run_in_threadpool(ya_hecha):
        return _respuesta_mision(*previa)
    llm: Llm = request.app.state.llm
    if not await llm.disponible():
        await run_in_threadpool(agente.saltar, "MANUAL", usuario.sub, "LLM_NO_DISPONIBLE")
        raise ErrorDeDominio("LLM_NO_DISPONIBLE", "El asistente no está disponible")
    nueva: list[UUID] = []

    def disparar() -> tuple[int, dict[str, Any]]:
        def hacer() -> tuple[int, dict[str, Any]]:
            mision_id = agente.abrir("MANUAL", usuario.sub)
            nueva.append(mision_id)
            auditar(s, usuario.sub, usuario.rol, "agente.disparar", str(mision_id), request, {})
            return 202, {"misionId": str(mision_id)}

        with transaccion() as s:
            return una_vez(s, clave, "dispararMision", usuario.sub, {}, hacer)

    status, respuesta = await run_in_threadpool(disparar)
    if nueva:
        tarea = asyncio.create_task(request.app.state.agente.correr(nueva[0]))
        _misiones.add(tarea)
        tarea.add_done_callback(_misiones.discard)
    return _respuesta_mision(status, respuesta)


class Pregunta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texto: str = Field(min_length=3, max_length=300)


class ResultadoReporte(BaseModel):
    """`ReporteResultado` del contrato: lo manda el Gateway (plan B), así que se valida antes de usarlo."""

    model_config = ConfigDict(extra="allow")
    reporteId: ReporteId
    titulo: str
    parametros: dict[str, Any]
    columnas: list[dict[str, Any]]
    filas: list[dict[str, Any]] = Field(max_length=MAX_FILAS_PANTALLA)
    totales: dict[str, Any]
    grafico: dict[str, Any]
    datosAl: datetime | None


class Redaccion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pregunta: str = Field(min_length=3, max_length=300)
    resultado: ResultadoReporte


def _voz(request: Request) -> Voz:
    return request.app.state.voz


def _exigir_voz(usuario: Usuario, request: Request) -> None:
    exigir(usuario, *ROLES_VOZ)
    # Las tres operaciones de voz comparten el límite (app.state.limite_voz): todas usan el mismo Ollama.
    request.app.state.limite_voz.registrar(usuario.sub)


@rutas.post("/voz/preguntas")
async def preguntar(cuerpo: Pregunta, usuario: UsuarioActual, request: Request) -> dict[str, Any]:
    _exigir_voz(usuario, request)
    respuesta = await _voz(request).preguntar(cuerpo.texto, set(usuario.roles), usuario.token)

    def registrar() -> None:
        with transaccion() as s:
            datos = {
                "tipo": respuesta["tipo"],
                "reporteId": respuesta.get("reporteId"),
                "parametros": respuesta.get("parametros"),
            }
            auditar(s, usuario.sub, usuario.rol, "voz.preguntar", None, request, datos)

    await run_in_threadpool(registrar)
    return respuesta


@rutas.post("/voz/interpretaciones")
async def interpretar(cuerpo: Pregunta, usuario: UsuarioActual, request: Request) -> dict[str, Any]:
    """Plan B de K1 (VOZ_CADENA=DOS_SALTOS): solo la intención validada; el Gateway llama al MCP."""
    _exigir_voz(usuario, request)
    return await _voz(request).interpretar(cuerpo.texto, set(usuario.roles))


@rutas.post("/voz/redacciones")
async def redactar(cuerpo: Redaccion, usuario: UsuarioActual, request: Request) -> dict[str, Any]:
    _exigir_voz(usuario, request)
    reporte = cuerpo.resultado.reporteId
    # El resultado lo manda quien llama: solo se redacta sobre un reporte que su rol puede ver.
    if not set(CATALOGO[reporte].roles) & usuario.roles:
        raise ErrorDeDominio("SIN_PERMISO", "No tienes permiso para ese reporte")
    r = cuerpo.resultado.model_dump(mode="json")
    texto = await _voz(request).redactar(cuerpo.pregunta, r)
    return {
        "tipo": "RESPUESTA",
        "texto": texto,
        "reporteId": reporte.value,
        "parametros": r["parametros"],
        "resultado": r,
        # Datos que no calculó Analítica: no se ofrecen como exportables (el Excel corre el reporte de nuevo).
        "exportable": False,
    }
