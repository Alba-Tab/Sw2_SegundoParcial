"""Documento PDF de un reporte (D110): la misma tabla que el Excel, en A4 horizontal, con sus parámetros."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fpdf import FPDF
from fpdf.fonts import FontFace

from app.configuracion import ZONA
from app.infraestructura.excel import _celda, parametro


def _miles(texto: str) -> str:
    """1,234.56 → 1.234,56 (como el pipe `bob` de la pantalla)."""
    return texto.replace(",", "_").replace(".", ",").replace("_", ".")


def _texto(valor: Any, tipo: str) -> str:
    v = _celda(valor, tipo)
    if v is None:
        return "—"
    if tipo == "MONTO":
        return _miles(f"{v:,.2f}")
    if tipo == "PORCENTAJE":
        return _miles(f"{Decimal(str(v)) * 100:.1f}") + " %"
    if tipo == "NUMERO" and isinstance(v, int | float | Decimal):
        return _miles(f"{v:,.2f}".rstrip("0").rstrip("."))
    if isinstance(v, datetime):
        return v.strftime("%d/%m/%Y %H:%M")
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    return str(v)


def _latin1(texto: str) -> str:
    # Las fuentes base del PDF solo traen Latin-1 (tildes y ñ sí); otro carácter sale como "?".
    return texto.replace("—", "-").encode("latin-1", "replace").decode("latin-1")


def documento(resultado: dict[str, Any], sub: str, ahora: datetime) -> bytes:
    columnas = resultado["columnas"]
    pdf = FPDF(orientation="L", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, _latin1(resultado["titulo"]), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", size=8)
    datos_al = resultado.get("datosAl")
    lineas = [
        *(f"{k}: {parametro(v)}" for k, v in resultado["parametros"].items()),
        f"Generado en: {ahora.astimezone(ZONA).strftime('%d/%m/%Y %H:%M')} por {sub}",
        f"Datos al: {_texto(datos_al, 'INSTANTE') if datos_al else 'Sin eventos procesados'}",
    ]
    for linea in lineas:
        pdf.cell(0, 4.5, _latin1(linea), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    derecha = {"MONTO", "NUMERO", "PORCENTAJE"}
    alineacion = tuple("RIGHT" if c["tipo"] in derecha else "LEFT" for c in columnas)
    totales = resultado.get("totales") or {}
    with pdf.table(
        text_align=alineacion,
        headings_style=FontFace(emphasis="BOLD", fill_color=(221, 231, 243)),
        line_height=5,
        repeat_headings=1,
    ) as tabla:
        tabla.row([_latin1(c["titulo"]) for c in columnas])
        for fila in resultado["filas"]:
            tabla.row([_latin1(_texto(fila.get(c["clave"]), c["tipo"])) for c in columnas])
        if any(c["clave"] in totales for c in columnas):
            total = [_texto(totales.get(c["clave"]), c["tipo"]) if c["clave"] in totales else "" for c in columnas]
            total[0] = total[0] or "Total"
            tabla.row([_latin1(t) for t in total], style=FontFace(emphasis="BOLD"))
    return bytes(pdf.output())
