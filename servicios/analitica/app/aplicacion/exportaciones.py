"""Exportaciones a Excel (spec 015, B; D21): 10 min de vida, solo las descarga el Gateway en nombre de quien la creó."""

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.aplicacion import reportes
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import MAX_FILAS_EXCEL, Parametros, ReporteId, nombre_archivo
from app.infraestructura.bd import Exportacion

VIDA = timedelta(minutes=10)
MAX_BYTES = 5 * 1024 * 1024  # D96


def crear(
    s: Session,
    reporte: ReporteId,
    p: Parametros,
    sub: str,
    roles: frozenset[str],
    ahora: datetime,
    generar: Callable[[dict[str, Any], str, datetime], bytes],
) -> dict[str, Any]:
    resultado = reportes.ejecutar(s, reporte, p, roles, max_filas=MAX_FILAS_EXCEL)
    archivo = generar(resultado, sub, ahora)
    if len(archivo) > MAX_BYTES:
        raise ErrorDeDominio("VALIDACION", "El archivo pasa de 5 MB: acorta el rango", "desde")
    exportacion = Exportacion(
        exportacion_id=uuid4(),
        sub=sub,
        reporte_id=reporte.value,
        nombre_archivo=nombre_archivo(reporte, reportes.hoy_la_paz()),
        archivo=archivo,
        creada_en=ahora,
        expira_en=ahora + VIDA,
    )
    s.add(exportacion)
    return {
        "exportacionId": str(exportacion.exportacion_id),
        "nombreArchivo": exportacion.nombre_archivo,
        "expiraEn": exportacion.expira_en,
    }


def archivo(s: Session, exportacion_id: UUID, solicitante: str, ahora: datetime) -> Exportacion:
    e = s.get(Exportacion, exportacion_id)
    if e is None or e.expira_en <= ahora:
        raise ErrorDeDominio("EXPORTACION_VENCIDA", "El enlace venció; vuelve a exportar")
    if e.sub != solicitante:
        raise ErrorDeDominio("SIN_PERMISO", "La exportación es de otra persona")
    return e


def purgar(s: Session, ahora: datetime) -> int:
    return s.execute(delete(Exportacion).where(Exportacion.expira_en <= ahora)).rowcount or 0
