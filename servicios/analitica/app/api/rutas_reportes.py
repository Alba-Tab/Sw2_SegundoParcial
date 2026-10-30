"""Catálogo, reportes y exportaciones a Excel (spec 015)."""

from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api.seguridad import Usuario, exigir, usuario_actual
from app.aplicacion import exportaciones, reportes
from app.aplicacion.auditoria import auditar
from app.aplicacion.idempotencia import una_vez
from app.dominio.alertas import ROLES_INTERNOS
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import Parametros, ReporteId
from app.infraestructura import excel
from app.infraestructura.bd import transaccion

rutas = APIRouter(prefix="/api/v1")
UsuarioActual = Annotated[Usuario, Depends(usuario_actual)]
UUID_TEXTO = r"^[0-9a-fA-F-]{36}$"


class ParametrosReporte(BaseModel):
    model_config = ConfigDict(extra="forbid")
    desde: date | None = None
    hasta: date | None = None
    clienteId: UUID | None = None
    rutaId: UUID | None = None
    placa: str | None = Field(default=None, pattern=r"^[0-9]{3,4}[A-Z]{3}$")
    umbral: float = Field(default=0.70, ge=0.5, le=0.95)
    agrupar: str = Field(default="VIAJE", pattern="^(VIAJE|RUTA)$")
    incluirVencidas: bool = True

    def dominio(self) -> Parametros:
        return Parametros(
            desde=self.desde,
            hasta=self.hasta,
            cliente_id=str(self.clienteId) if self.clienteId else None,
            ruta_id=str(self.rutaId) if self.rutaId else None,
            placa=self.placa,
            umbral=self.umbral,
            agrupar=self.agrupar,
            incluir_vencidas=self.incluirVencidas,
        )


@rutas.get("/reportes")
def listar_reportes(usuario: UsuarioActual) -> dict[str, Any]:
    exigir(usuario, *ROLES_INTERNOS, "agente_lectura")
    return {"reportes": reportes.catalogo()}


@rutas.get("/reportes/{reporte_id}")
def ejecutar_reporte(
    reporte_id: ReporteId, usuario: UsuarioActual, parametros: Annotated[ParametrosReporte, Query()]
) -> dict[str, Any]:
    with transaccion() as s:
        return reportes.ejecutar(s, reporte_id, parametros.dominio(), usuario.roles)


class ExportacionNueva(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reporteId: ReporteId
    parametros: ParametrosReporte = Field(default_factory=ParametrosReporte)


@rutas.post("/exportaciones")
def crear_exportacion(
    cuerpo: ExportacionNueva,
    usuario: UsuarioActual,
    request: Request,
    idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
) -> JSONResponse:
    def hacer() -> tuple[int, dict[str, Any]]:
        ahora = excel.ahora()
        r = exportaciones.crear(
            s, cuerpo.reporteId, cuerpo.parametros.dominio(), usuario.sub, usuario.roles, ahora, excel.libro
        )
        datos = {"reporteId": cuerpo.reporteId.value, "parametros": cuerpo.parametros.model_dump(mode="json")}
        auditar(s, usuario.sub, usuario.rol, "reporte.exportar", r["exportacionId"], request, datos)
        return 201, r

    with transaccion() as s:
        status, respuesta = una_vez(
            s, idempotency_key, "crearExportacion", usuario.sub, cuerpo.model_dump(mode="json"), hacer
        )
    return JSONResponse(respuesta, status_code=status)


@rutas.get("/exportaciones/{exportacion_id}/archivo")
def obtener_archivo(
    exportacion_id: UUID,
    usuario: UsuarioActual,
    solicitante: Annotated[str, Header(alias="X-Solicitante-Sub", min_length=1, max_length=64)],
) -> Response:
    # Solo el token de servicio del Gateway (client credentials): ninguna persona lo llama directo (D21).
    if usuario.azp != "gateway" or usuario.roles & (ROLES_INTERNOS | {"cliente", "chofer", "comercial"}):
        raise ErrorDeDominio("SIN_PERMISO", "Solo el Gateway descarga exportaciones")
    with transaccion() as s:
        e = exportaciones.archivo(s, exportacion_id, solicitante, excel.ahora())
        return Response(
            e.archivo,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{e.nombre_archivo}"', "Cache-Control": "no-store"},
        )
