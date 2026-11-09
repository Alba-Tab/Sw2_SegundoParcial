"""T8.4: los modelos entrenados con la semilla fija cumplen las metas y son reproducibles."""

from pathlib import Path

import pytest

from app.infraestructura.ml import cargar_modelos
from ml.entrenar import cargas_con_referencia, entrenar_anomalias, entrenar_retraso, muestras

DATOS = Path(__file__).resolve().parents[3] / "plataforma" / "datos-sinteticos"


@pytest.fixture(scope="module")
def modelos(tmp_path_factory):
    import joblib

    carpeta = tmp_path_factory.mktemp("modelos")
    retraso, metricas = entrenar_retraso(muestras(DATOS))
    anomalias, _ = entrenar_anomalias(cargas_con_referencia(DATOS))
    joblib.dump(retraso, carpeta / "retraso.joblib")
    joblib.dump(anomalias, carpeta / "anomalias.joblib")
    return cargar_modelos(str(carpeta)), metricas


def simulador(**cambios):
    """Paso 7 del escenario: 6 h en ruta, 2 bloqueos y la última hora detenido (spec 013)."""
    return {
        "distanciaKm": 850,
        "fraccionRecorrida": 0.25,
        "horasTranscurridas": 6,
        "horasPlanificadas": 15.45,
        "retrasoSalidaHoras": 1.0,
        "bloqueos": 2,
        "fallas": 0,
        "minutosDetenido": 60,
        "toneladas": 28,
        "tipoCarga": "GRANOS",
    } | cambios


def test_recall_d82_y_riesgo_del_simulador(modelos):
    m, metricas = modelos
    assert metricas["recall"] >= 0.75
    riesgo = m.retraso(simulador())
    assert riesgo.probabilidad >= 0.70 and 1 <= len(riesgo.factores) <= 3
    normal = m.retraso(simulador(bloqueos=0, minutosDetenido=0, fraccionRecorrida=0.37))
    assert normal.probabilidad < 0.70


def test_ff2_anomalia_de_combustible(modelos):
    m, _ = modelos
    assert m.anomalia(0.267, 450).es_anomalia
    assert not m.anomalia(2.5, 180).es_anomalia


def test_entrenar_dos_veces_da_las_mismas_predicciones(modelos):
    m, _ = modelos
    otro, _ = entrenar_retraso(muestras(DATOS))
    import pandas as pd

    from app.dominio.retraso import CATEGORICAS, NUMERICAS

    x = pd.DataFrame([simulador()])[[*NUMERICAS, *CATEGORICAS]]
    assert otro["modelo"].predict_proba(x)[0, 1] == pytest.approx(m.retraso(simulador()).probabilidad, abs=1e-12)
