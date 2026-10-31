"""Consulta por voz (spec 015): el LLM solo propone la intención; periodos, nombres, límites y números los decide aquí."""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import CATALOGO, ReporteId

PERIODOS = ("HOY", "ESTA_SEMANA", "ESTE_MES", "MES_ANTERIOR", "MES", "ULTIMOS_30_DIAS", "ULTIMOS_3_MESES", "RANGO")


def normalizar(texto: str) -> str:
    """Minúsculas, sin tildes ni signos: "Agroexport S.R.L." → "agroexport srl"."""
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", sin_tildes.lower())).strip()


def coincidencias(dicho: str, nombres: dict[str, str]) -> list[str]:
    """Ids cuyos nombres coinciden: exacto primero; si no, por prefijo de palabra ("agro" → "Agro Moroso" y "Agroexport")."""
    buscado = normalizar(dicho)
    if not buscado:
        return []
    exactos = [i for i, n in nombres.items() if normalizar(n) == buscado]
    if exactos:
        return exactos
    palabras = buscado.split()
    return [i for i, n in nombres.items() if all(any(p.startswith(d) for p in normalizar(n).split()) for d in palabras)]


@dataclass(frozen=True)
class Intencion:
    reporte_id: str | None
    periodo: str | None
    mes: int | None = None
    anio: int | None = None
    desde: str | None = None
    hasta: str | None = None
    cliente: str | None = None
    placa: str | None = None
    ruta: str | None = None
    agrupar: str | None = None
    aclaracion: str | None = None


def _fin_de_mes(d: date) -> date:
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)


def fechas(reporte: ReporteId, i: Intencion, hoy: date) -> tuple[date, date]:
    """Periodo con nombre → fechas, con la fecha de hoy en America/La_Paz (spec 015)."""
    adelante = reporte == ReporteId.CUENTAS_POR_COBRAR  # mira vencimientos
    match i.periodo:
        case "HOY":
            return hoy, hoy
        case "ESTA_SEMANA":
            return (hoy, hoy + timedelta(days=6)) if adelante else (hoy - timedelta(days=6), hoy)
        case "ESTE_MES":
            return hoy.replace(day=1), _fin_de_mes(hoy)
        case "MES_ANTERIOR":
            fin = hoy.replace(day=1) - timedelta(days=1)
            return fin.replace(day=1), fin
        case "MES":
            if not i.mes or not 1 <= i.mes <= 12:
                raise ErrorDeDominio("ACLARACION", "¿De qué mes?")
            # Sin año: el del año en curso, o el anterior si ese mes todavía no llegó.
            anio = i.anio or (hoy.year if i.mes <= hoy.month else hoy.year - 1)
            inicio = date(anio, i.mes, 1)
            return inicio, _fin_de_mes(inicio)
        case "ULTIMOS_30_DIAS":
            return hoy - timedelta(days=29), hoy
        case "ULTIMOS_3_MESES":
            return hoy - timedelta(days=91), hoy
        case "RANGO":
            try:
                desde, hasta = date.fromisoformat(i.desde or ""), date.fromisoformat(i.hasta or "")
            except ValueError as e:
                raise ErrorDeDominio("ACLARACION", "¿Entre qué fechas? Dímelas como día, mes y año") from e
            if hasta < desde:
                raise ErrorDeDominio("ACLARACION", "La fecha final es anterior a la inicial")
            return desde, hasta
    raise ErrorDeDominio("ACLARACION", "¿De qué periodo? Por ejemplo, esta semana o este mes")


def numeros_validos(texto: str, filas: list[dict], totales: dict) -> bool:
    """Regla de números (spec 015, paso 6): cada número del texto debe estar en filas o totales."""

    def variantes(valor: object) -> set[str]:
        if isinstance(valor, bool) or valor is None:
            return set()
        s = str(valor)
        try:
            n = Decimal(s)
        except InvalidOperation:
            return {s}
        if not n.is_finite():
            return {s}
        con_dec = _es_bo(n)
        formas = {s, con_dec, con_dec.replace(".", "")}
        if "." in s:
            formas.add(s.rstrip("0").rstrip("."))
        # "8.400" solo vale para 8400 o 8400,00: para 8400,50 sería un número que no está en los datos.
        if n == n.to_integral_value():
            formas |= {f"{n:,.0f}".replace(",", "."), str(int(n))}
        return formas

    permitidos: set[str] = set()
    for fila in filas:
        for v in fila.values():
            permitidos |= variantes(v)
    for v in totales.values():
        permitidos |= variantes(v)
    for m in re.findall(r"\d[\d.,]*\d|\d", texto):
        limpio = m.rstrip(".,")
        if limpio in permitidos:
            continue
        # Fechas como "03/11" o días ("en 5 días") que sí están en las filas como fecha o número.
        if re.fullmatch(r"\d{1,2}", limpio) and limpio in {p for x in permitidos for p in re.split(r"[-/]", x)}:
            continue
        return False
    return True


def _es_bo(monto: Decimal) -> str:
    """8400.5 → "8.400,50" (formato boliviano, 2 decimales, sin pasar por float)."""
    return f"{monto.quantize(Decimal('0.01')):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def plantilla(reporte: ReporteId, filas: list[dict], totales: dict) -> str:
    """Texto fijo cuando el LLM no responde o inventa números."""
    titulo = CATALOGO[reporte].titulo
    if reporte == ReporteId.CUENTAS_POR_COBRAR:
        monto = _es_bo(Decimal(str(totales.get("saldo", "0.00"))))
        return f"Hay {len(filas)} facturas con saldo por {monto} BOB en el periodo."
    return f"{titulo}: {len(filas)} filas."
