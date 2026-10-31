"""Problem Details (RFC 9457) con el código estable de 000 §5."""

import logging
import uuid

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolAgotado
from starlette.exceptions import HTTPException

from app.dominio.errores import ErrorDeDominio
from app.infraestructura.mcp import ERRORES_MCP
from app.infraestructura.observabilidad import correlacion
from app.infraestructura.tokens import ErrorToken

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
    "LIMITE_PETICIONES": 429,
    "DEPENDENCIA_NO_DISPONIBLE": 503,
    "LLM_NO_DISPONIBLE": 503,
}
TITULOS = {
    400: "Petición inválida",
    401: "No autenticado",
    403: "Sin permiso",
    404: "No encontrado",
    409: "Conflicto",
    429: "Demasiadas peticiones",
    500: "Error interno",
    503: "Servicio no disponible",
}
# Una dependencia que no responde (base, Keycloak, LLM o MCP) es 503 con Retry-After, no un error interno.
DEPENDENCIAS: tuple[type[Exception], ...] = (
    OperationalError,
    InterfaceError,
    PoolAgotado,
    ErrorToken,
    httpx.HTTPError,
    *ERRORES_MCP,
)


def problema(
    request: Request,
    codigo: str,
    detalle: str,
    status: int | None = None,
    errores: list | None = None,
    reintentar_en: int | None = None,
) -> JSONResponse:
    status = status or STATUS.get(codigo, 422)
    cuerpo = {
        "type": f"https://transporte.local/errores/{codigo.lower().replace('_', '-')}",
        "title": TITULOS.get(status, "Regla de negocio" if status == 422 else "Error"),
        "status": status,
        "detail": detalle,
        "codigo": codigo,
        "correlationId": request.headers.get("x-correlation-id") or correlacion() or str(uuid.uuid4()),
    }
    if errores:
        cuerpo["errores"] = errores
    cabeceras = {}
    if status in (429, 503):
        cabeceras["Retry-After"] = str(reintentar_en or 30)
    if status == 401:
        cabeceras["WWW-Authenticate"] = 'Bearer realm="transporte"'
    return JSONResponse(cuerpo, status_code=status, media_type="application/problem+json", headers=cabeceras)


def registrar(app: FastAPI) -> None:
    @app.exception_handler(ErrorDeDominio)
    async def dominio(request: Request, e: ErrorDeDominio) -> JSONResponse:
        errores = [{"campo": e.campo, "mensaje": e.mensaje}] if e.campo else None
        return problema(request, e.codigo, e.mensaje, errores=errores, reintentar_en=getattr(e, "reintentar_en", None))

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

    async def dependencia(request: Request, e: Exception) -> JSONResponse:
        log.warning("Dependencia no disponible en %s %s: %r", request.method, request.url.path, e)
        return problema(request, "DEPENDENCIA_NO_DISPONIBLE", "Una dependencia de Analítica no responde")

    for clase in DEPENDENCIAS:
        app.add_exception_handler(clase, dependencia)

    @app.exception_handler(Exception)
    async def inesperado(request: Request, e: Exception) -> JSONResponse:
        """Nunca texto plano ni trazas de pila (000 §5): 500 en Problem Details y el detalle solo en el log."""
        log.exception("Error inesperado en %s %s", request.method, request.url.path)
        return problema(request, "ERROR_INTERNO", "Ocurrió un error inesperado", status=500)
