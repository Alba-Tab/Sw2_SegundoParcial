"""T8.8: `python -m app.demo reiniciar` deja la semilla de la defensa y 3 meses de historia, sin eventos."""

from datetime import timedelta

from sqlalchemy import func, select

from app import demo
from app.aplicacion.consultas import hoy
from app.infraestructura.bd import HechoCombustible, InboxEvento, Outbox, Ruta, transaccion
from tests.conftest import token


def test_reiniciar_carga_semilla_y_sinteticos(cliente):
    demo.main("reiniciar")
    demo.main("cargar")  # idempotente
    with transaccion() as s:
        assert s.scalar(select(func.count()).select_from(Ruta)) == 4
        assert s.scalar(select(func.count()).select_from(HechoCombustible)) > 900
        assert (
            s.scalar(select(func.count()).select_from(HechoCombustible).where(HechoCombustible.placa == "4521KTR")) == 0
        )
        assert s.scalar(select(func.count()).select_from(InboxEvento)) == 0
        assert s.scalar(select(func.count()).select_from(Outbox)) == 0
    h = hoy()
    cxc = cliente.get(
        f"/api/v1/reportes/CUENTAS_POR_COBRAR?desde={h}&hasta={h + timedelta(days=6)}", headers=token("gerente")
    ).json()
    assert [(f["cliente"], f["saldo"]) for f in cxc["filas"]] == [
        ("Agroexport SRL", "7600.00"),
        ("Agroexport SRL", "2800.00"),
    ]
    mora = cliente.get(
        f"/api/v1/reportes/CUENTAS_POR_COBRAR?desde={h - timedelta(days=30)}&hasta={h}", headers=token("gerente")
    ).json()
    assert [f["cliente"] for f in mora["filas"]] == ["Agro Moroso"]
    rentable = cliente.get(
        f"/api/v1/reportes/RENTABILIDAD?desde={h - timedelta(days=95)}&hasta={h}&agrupar=RUTA", headers=token("gerente")
    ).json()
    assert len(rentable["filas"]) == 4 and float(rentable["totales"]["margen"]) > 0
    consumo = cliente.get(
        f"/api/v1/reportes/CONSUMO_COMBUSTIBLE?desde={h - timedelta(days=91)}&hasta={h}", headers=token("jefe_flota")
    ).json()
    assert len(consumo["filas"]) == 8 and consumo["totales"]["anomalias"] > 0
