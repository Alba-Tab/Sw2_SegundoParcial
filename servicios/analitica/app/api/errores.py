"""Problem Details (RFC 9457) con el código estable de 000 §5."""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException

from app.dominio.errores import ErrorDeDominio

log = logging.getLogger(__name__)

STATUS = {
    "VALIDACION": 400,
    "NO_AUTENTICADO": 401,
    "SIN_PERMISO": 403,
    "NO_ENCONTRADO": 404,
    "EXPORTACION_VENCIDA": 404,
    "CONFLICTO_ESTADO": 409,
    "IDEMPOTENCIA_EN_PROCESO": 409,
    "IDEMPOTENCIA_CUERPO_DISTINTO": 422,
    "PREGUNTA_FUERA_DE_ALCANCE": 422,
    "LIMITE_ACCIONES": 422,
    "DEPENDENCIA_NO_DISPONIBLE": 503,
    "LLM_NO_DISPONIBLE": 503,
    "MODELO_NO_DISPONIBLE": 503,
}
TITULOS = {400: "Petición inválida", 401: "No autenticado", 403: "Sin permiso", 404: "No encontrado", 409: "Conflicto"}


def problema(
    request: Request, codigo: str, detalle: str, status: int | None = None, errores: list | None = None
) -> JSONResponse:
    status = status or STATUS.get(codigo, 422)
    cuerpo = {
        "type": f"https://transporte.local/errores/{codigo.lower().replace('_', '-')}",
        "title": TITULOS.get(status, "Regla de negocio" if status == 422 else "Error"),
        "status": status,
        "detail": detalle,
        "codigo": codigo,
        "correlationId": request.headers.get("x-correlation-id") or str(uuid.uuid4()),
    }
    if errores:
        cuerpo["errores"] = errores
    cabeceras = {"Retry-After": "30"} if status == 503 else {}
    if status == 401:
        cabeceras["WWW-Authenticate"] = 'Bearer realm="transporte"'
    return JSONResponse(cuerpo, status_code=status, media_type="application/problem+json", headers=cabeceras)


def registrar(app: FastAPI) -> None:
    @app.exception_handler(ErrorDeDominio)
    async def dominio(request: Request, e: ErrorDeDominio) -> JSONResponse:
        errores = [{"campo": e.campo, "mensaje": e.mensaje}] if e.campo else None
        return problema(request, e.codigo, e.mensaje, errores=errores)

    @app.exception_handler(RequestValidationError)
    async def validacion(request: Request, e: RequestValidationError) -> JSONResponse:
        errores = [
            {
                "campo": ".".join(str(p) for p in err["loc"] if p not in ("body", "query", "path", "header")),
                "mensaje": err["msg"],
            }
            for err in e.errors()
        ]
        return problema(request, "VALIDACION", "La petición no es válida", errores=errores)

    @app.exception_handler(HTTPException)
    async def http(request: Request, e: HTTPException) -> JSONResponse:
        codigo = {404: "NO_ENCONTRADO", 405: "VALIDACION", 401: "NO_AUTENTICADO"}.get(e.status_code, "VALIDACION")
        return problema(request, codigo, str(e.detail), status=e.status_code)

    @app.exception_handler(OperationalError)
    async def base(request: Request, e: OperationalError) -> JSONResponse:
        log.warning("Base no disponible: %s", e)
        return problema(request, "DEPENDENCIA_NO_DISPONIBLE", "La base de Analítica no responde")
