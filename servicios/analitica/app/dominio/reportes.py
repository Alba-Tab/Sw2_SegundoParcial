"""Catálogo de los 5 reportes (spec 015, propuesta 4.6): parámetros, roles, límites y columnas."""

import re
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from typing import Any

from app.dominio.errores import ErrorDeDominio

MAX_FILAS_PANTALLA = 500
MAX_FILAS_EXCEL = 10_000
PLACA = re.compile(r"^[0-9]{3,4}[A-Z]{3}$")


class ReporteId(StrEnum):
    CUENTAS_POR_COBRAR = "CUENTAS_POR_COBRAR"
    VIAJES_EN_RIESGO = "VIAJES_EN_RIESGO"
    FACTURACION_POR_CLIENTE = "FACTURACION_POR_CLIENTE"
    CONSUMO_COMBUSTIBLE = "CONSUMO_COMBUSTIBLE"
    RENTABILIDAD = "RENTABILIDAD"


@dataclass(frozen=True)
class Columna:
    clave: str
    titulo: str
    tipo: str  # TEXTO, MONTO, NUMERO, PORCENTAJE, FECHA, INSTANTE, BOOLEANO


@dataclass(frozen=True)
class Definicion:
    reporte_id: ReporteId
    titulo: str
    descripcion: str
    pregunta: str
    roles: tuple[str, ...]
    max_dias: int | None
    filtros: tuple[str, ...]
    columnas: tuple[Columna, ...]
    grafico: dict[str, Any] = field(default_factory=dict)


C = Columna
CATALOGO: dict[ReporteId, Definicion] = {
    ReporteId.CUENTAS_POR_COBRAR: Definicion(
        ReporteId.CUENTAS_POR_COBRAR,
        "Cuentas por cobrar",
        "Facturas con saldo por fecha de vencimiento.",
        "¿Qué clientes me deben pagar esta semana?",
        ("administracion", "gerente"),
        92,
        ("clienteId", "incluirVencidas"),
        (
            C("cliente", "Cliente", "TEXTO"),
            C("factura", "Factura", "TEXTO"),
            C("monto", "Monto", "MONTO"),
            C("saldo", "Saldo", "MONTO"),
            C("vencimiento", "Vencimiento", "FECHA"),
            C("dias", "Días para vencer", "NUMERO"),
            C("vencida", "Vencida", "BOOLEANO"),
        ),
        {"tipo": "BARRAS", "ejeX": "cliente", "series": [{"clave": "saldo", "titulo": "Saldo"}]},
    ),
    ReporteId.VIAJES_EN_RIESGO: Definicion(
        ReporteId.VIAJES_EN_RIESGO,
        "Viajes en riesgo de retraso",
        "Viajes en ruta con probabilidad de retraso igual o mayor al umbral.",
        "¿Qué viajes van atrasados?",
        ("despachador", "gerente"),
        None,
        ("rutaId", "umbral"),
        (
            C("viajeId", "Viaje", "TEXTO"),
            C("cliente", "Cliente", "TEXTO"),
            C("ruta", "Ruta", "TEXTO"),
            C("placa", "Placa", "TEXTO"),
            C("chofer", "Chofer", "TEXTO"),
            C("probabilidad", "Probabilidad", "PORCENTAJE"),
            C("bloqueos", "Bloqueos", "NUMERO"),
            C("ultimaPosicion", "Última posición", "TEXTO"),
            C("ultimaPosicionEn", "Hora de la posición", "INSTANTE"),
        ),
        {"tipo": "BARRAS", "ejeX": "placa", "series": [{"clave": "probabilidad", "titulo": "Probabilidad"}]},
    ),
    ReporteId.FACTURACION_POR_CLIENTE: Definicion(
        ReporteId.FACTURACION_POR_CLIENTE,
        "Facturación por cliente",
        "Facturado, cobrado y saldo por cliente y mes de emisión.",
        "¿Cuánto facturamos a Agroexport en octubre?",
        ("administracion", "gerente"),
        366,
        ("clienteId",),
        (
            C("cliente", "Cliente", "TEXTO"),
            C("mes", "Mes", "TEXTO"),
            C("facturas", "Facturas", "NUMERO"),
            C("facturado", "Facturado", "MONTO"),
            C("cobrado", "Cobrado", "MONTO"),
            C("saldo", "Saldo", "MONTO"),
        ),
        {
            "tipo": "BARRAS_APILADAS",
            "ejeX": "mes",
            "series": [{"clave": "cobrado", "titulo": "Cobrado"}, {"clave": "saldo", "titulo": "Saldo"}],
        },
    ),
    ReporteId.CONSUMO_COMBUSTIBLE: Definicion(
        ReporteId.CONSUMO_COMBUSTIBLE,
        "Consumo de combustible",
        "Rendimiento, gasto, anomalías y caídas por tracto.",
        "¿Qué camiones gastan más diésel por kilómetro?",
        ("jefe_flota", "gerente"),
        92,
        ("placa",),
        (
            C("placa", "Placa", "TEXTO"),
            C("km", "Km", "NUMERO"),
            C("litros", "Litros", "NUMERO"),
            C("kmPorLitro", "Km/L", "NUMERO"),
            C("monto", "Gasto (BOB)", "MONTO"),
            C("bobPorKm", "BOB/km", "MONTO"),
            C("anomalias", "Anomalías", "NUMERO"),
            C("caidas", "Caídas", "NUMERO"),
        ),
        {"tipo": "BARRAS", "ejeX": "placa", "series": [{"clave": "kmPorLitro", "titulo": "Km/L"}]},
    ),
    ReporteId.RENTABILIDAD: Definicion(
        ReporteId.RENTABILIDAD,
        "Rentabilidad",
        "Ingreso facturado menos combustible, por viaje o por ruta (datos de Viajes, Finanzas y Flota).",
        "¿Cuánto nos dejó la ruta a Arica este mes?",
        ("gerente", "administracion"),
        366,
        ("agrupar", "rutaId"),
        (
            C("grupo", "Viaje o ruta", "TEXTO"),
            C("viajes", "Viajes", "NUMERO"),
            C("km", "Km", "NUMERO"),
            C("ingreso", "Ingreso facturado", "MONTO"),
            C("combustible", "Combustible", "MONTO"),
            C("margen", "Margen", "MONTO"),
            C("margenPct", "Margen %", "PORCENTAJE"),
            C("bobPorKm", "Margen BOB/km", "MONTO"),
        ),
        {"tipo": "BARRAS", "ejeX": "grupo", "series": [{"clave": "margen", "titulo": "Margen"}]},
    ),
}


@dataclass(frozen=True)
class Parametros:
    desde: date | None = None
    hasta: date | None = None
    cliente_id: str | None = None
    ruta_id: str | None = None
    placa: str | None = None
    umbral: float = 0.70
    agrupar: str = "VIAJE"
    incluir_vencidas: bool = True

    def a_json(self, reporte: ReporteId) -> dict[str, Any]:
        """Solo los parámetros que aplican a ese reporte, con los nombres del contrato."""
        d = CATALOGO[reporte]
        salida: dict[str, Any] = {}
        if d.max_dias is not None:
            salida |= {
                "desde": self.desde.isoformat() if self.desde else None,
                "hasta": self.hasta.isoformat() if self.hasta else None,
            }
        valores = {
            "clienteId": self.cliente_id,
            "rutaId": self.ruta_id,
            "placa": self.placa,
            "umbral": self.umbral,
            "agrupar": self.agrupar,
            "incluirVencidas": self.incluir_vencidas,
        }
        salida |= {k: valores[k] for k in d.filtros if valores[k] is not None}
        return salida


def validar(reporte: ReporteId, p: Parametros, roles: set[str] | frozenset[str]) -> None:
    """Permisos y límites en código (spec 015, regla de validación 3 y 5). Fuera de rango → 400 en el campo."""
    d = CATALOGO[reporte]
    if not set(d.roles) & set(roles):
        raise ErrorDeDominio("SIN_PERMISO", "No tienes permiso para ese reporte")
    if d.max_dias is not None:
        if p.desde is None or p.hasta is None:
            raise ErrorDeDominio(
                "VALIDACION", "El reporte necesita desde y hasta", "desde" if p.desde is None else "hasta"
            )
        if p.hasta < p.desde:
            raise ErrorDeDominio("VALIDACION", "hasta debe ser igual o posterior a desde", "hasta")
        if (p.hasta - p.desde).days + 1 > d.max_dias:
            raise ErrorDeDominio("VALIDACION", f"El máximo es {d.max_dias} días", "desde")
    if not 0.5 <= p.umbral <= 0.95:
        raise ErrorDeDominio("VALIDACION", "El umbral va de 0,50 a 0,95", "umbral")
    if p.agrupar not in ("VIAJE", "RUTA"):
        raise ErrorDeDominio("VALIDACION", "agrupar es VIAJE o RUTA", "agrupar")
    if p.placa is not None and not PLACA.match(p.placa):
        raise ErrorDeDominio("VALIDACION", "La placa no tiene el formato 1234ABC", "placa")


def esquema_parametros(reporte: ReporteId) -> dict[str, Any]:
    """JSON Schema de los parámetros (lo publican `GET /reportes` y el recurso `catalogo://reportes` del MCP)."""
    d = CATALOGO[reporte]
    propiedades: dict[str, Any] = {}
    requeridos: list[str] = []
    if d.max_dias is not None:
        propiedades |= {"desde": {"type": "string", "format": "date"}, "hasta": {"type": "string", "format": "date"}}
        requeridos = ["desde", "hasta"]
    tipos = {
        "clienteId": {"type": "string", "format": "uuid"},
        "rutaId": {"type": "string", "format": "uuid"},
        "placa": {"type": "string", "pattern": PLACA.pattern},
        "umbral": {"type": "number", "minimum": 0.5, "maximum": 0.95, "default": 0.7},
        "agrupar": {"type": "string", "enum": ["VIAJE", "RUTA"], "default": "VIAJE"},
        "incluirVencidas": {
            "type": "boolean",
            "default": True,
            "description": "Dentro del rango de vencimiento: con false, solo las que todavía no vencieron (vencimiento ≥ hoy)",
        },
    }
    propiedades |= {f: tipos[f] for f in d.filtros}
    return {"type": "object", "additionalProperties": False, "properties": propiedades, "required": requeridos}


def nombre_archivo(reporte: ReporteId, hoy: date) -> str:
    return f"{reporte.value.lower().replace('_', '-')}-{hoy.isoformat()}.xlsx"
