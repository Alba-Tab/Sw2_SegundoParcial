from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.dominio.alertas import validar_atencion
from app.dominio.combustible import km_por_litro
from app.dominio.conduccion import puntaje
from app.dominio.errores import ErrorDeDominio
from app.dominio.retraso import DatosViaje, minutos_detenido, retrasado, variables


def test_puntaje_de_conduccion_d84():
    assert puntaje(0, 0, 0) == 100
    assert puntaje(1, 0, 120) == pytest.approx(91.7)
    assert puntaje(1, 1, 120) == 75
    assert puntaje(5, 5, 100) == 0
    assert puntaje(1, 0, None) == 0


def test_km_por_litro_ff2():
    assert km_por_litro(184320, None, 180.5) is None  # primera carga del tracto: SIN_REFERENCIA
    assert km_por_litro(184440, 184320, 450) == Decimal("0.267")
    assert km_por_litro(184890, 184440, 180) == Decimal("2.500")


def test_atender_solo_un_rol_de_la_alerta_y_no_el_gerente():
    validar_atencion("ABIERTA", ["despachador", "gerente"], {"despachador"}, "visto")
    with pytest.raises(ErrorDeDominio, match="no puede atender") as e:
        validar_atencion("ABIERTA", ["despachador", "gerente"], {"gerente"}, None)
    assert e.value.codigo == "SIN_PERMISO"
    with pytest.raises(ErrorDeDominio) as e:
        validar_atencion("RESUELTA", ["despachador"], {"despachador"}, None)
    assert e.value.codigo == "CONFLICTO_ESTADO"
    with pytest.raises(ErrorDeDominio):
        validar_atencion("ABIERTA", ["despachador"], {"despachador"}, "x" * 301)


def test_minutos_detenido_en_la_ultima_hora():
    t0 = datetime(2026, 11, 3, 12, tzinfo=UTC)
    puntos = [(t0, 60.0), (t0 + timedelta(minutes=30), 0.0), (t0 + timedelta(minutes=50), 0.0)]
    assert minutos_detenido(puntos, t0 + timedelta(minutes=90)) == 60
    assert minutos_detenido(puntos, t0 + timedelta(minutes=60)) == 30
    assert minutos_detenido([(t0, 70.0)], t0 + timedelta(minutes=10)) == 0


def test_variables_d79_y_etiqueta_d80():
    inicio = datetime(2026, 11, 3, 7, tzinfo=UTC)  # 03:00 en La Paz: 4 h antes de las 07:00
    v = DatosViaje(
        distancia_km=550,
        origen=(-17.78, -63.18),
        destino=(-16.5, -68.15),
        ultima_posicion=(-17.4, -63.88),
        iniciado_en=inicio,
        fecha_viaje=date(2026, 11, 3),
        bloqueos=2,
        fallas=0,
        toneladas=28,
        tipo_carga="GRANOS",
        puntos=[(inicio + timedelta(hours=5), 0.0)],
    )
    x = variables(v, inicio + timedelta(hours=6))
    assert x["horasTranscurridas"] == 6
    assert x["horasPlanificadas"] == 10
    assert x["retrasoSalidaHoras"] == -4
    assert x["minutosDetenido"] == 60
    assert 0 < x["fraccionRecorrida"] < 0.3
    assert retrasado(13, 550) and not retrasado(12, 550)
