from datetime import date

import pytest

from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import ReporteId
from app.dominio.voz import Intencion, coincidencias, fechas, normalizar, numeros_validos, plantilla

CLIENTES = {"a": "Agroexport SRL", "m": "Agro Moroso", "f": "Ferretería Sin Crédito"}
HOY = date(2026, 11, 3)


def test_nombres_exacto_y_por_prefijo_de_palabra():
    assert normalizar("  Ferretería   Sin-Crédito ") == "ferreteria sincredito"
    assert coincidencias("Agroexport SRL", CLIENTES) == ["a"]
    assert sorted(coincidencias("agro", CLIENTES)) == ["a", "m"]
    assert coincidencias("ferreteria", CLIENTES) == ["f"]
    assert coincidencias("constructora", CLIENTES) == []


def test_periodos_spec_015():
    cxc, fact = ReporteId.CUENTAS_POR_COBRAR, ReporteId.FACTURACION_POR_CLIENTE
    assert fechas(cxc, Intencion(cxc, "ESTA_SEMANA"), HOY) == (date(2026, 11, 3), date(2026, 11, 9))
    assert fechas(fact, Intencion(fact, "ESTA_SEMANA"), HOY) == (date(2026, 10, 28), date(2026, 11, 3))
    # "octubre" dicho en noviembre de 2026 es octubre de 2026; "diciembre", el del año anterior.
    assert fechas(fact, Intencion(fact, "MES", mes=10), HOY) == (date(2026, 10, 1), date(2026, 10, 31))
    assert fechas(fact, Intencion(fact, "MES", mes=12), HOY) == (date(2025, 12, 1), date(2025, 12, 31))
    assert fechas(fact, Intencion(fact, "MES_ANTERIOR"), HOY) == (date(2026, 10, 1), date(2026, 10, 31))
    assert fechas(fact, Intencion(fact, "RANGO", desde="2026-09-01", hasta="2026-09-15"), HOY)[1] == date(2026, 9, 15)
    with pytest.raises(ErrorDeDominio):
        fechas(fact, Intencion(fact, None), HOY)
    with pytest.raises(ErrorDeDominio):
        fechas(fact, Intencion(fact, "RANGO", desde="ayer"), HOY)


def test_regla_de_numeros_en_la_redaccion():
    filas = [{"factura": "FAC-000002", "saldo": "7600.00", "vencimiento": "2026-11-05", "dias": 2}]
    totales = {"saldo": "10400.00", "facturas": 2}
    assert numeros_validos(
        "Agroexport debe 10.400,00 BOB en 2 facturas; la de 7.600,00 vence el 05/11.", filas, totales
    )
    assert not numeros_validos("Agroexport debe 12.000,00 BOB.", filas, totales)
    assert (
        plantilla(ReporteId.CUENTAS_POR_COBRAR, filas * 2, totales)
        == "Hay 2 facturas con saldo por 10.400,00 BOB en el periodo."
    )
