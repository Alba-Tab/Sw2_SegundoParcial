"""Modelos de ML entrenados en el build (T8.4): `retraso.joblib` y `anomalias.joblib` en MODELOS_DIR."""

import logging
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.aplicacion.puertos import Prediccion, Puntaje
from app.dominio.retraso import CATEGORICAS, NOMBRES, NUMERICAS

log = logging.getLogger(__name__)


class ModelosCargados:
    def __init__(self, retraso: dict[str, Any] | None, anomalias: dict[str, Any] | None) -> None:
        self._retraso = retraso
        self._anomalias = anomalias

    @property
    def cargados(self) -> bool:
        return self._retraso is not None and self._anomalias is not None

    def retraso(self, variables: dict[str, float | str]) -> Prediccion | None:
        if self._retraso is None:
            return None
        modelo = self._retraso["modelo"]
        columnas = [*NUMERICAS, *CATEGORICAS]
        base = pd.DataFrame([{c: variables[c] for c in columnas}])
        probabilidad = float(modelo.predict_proba(base)[0, 1])
        # Factores: cuánto baja la probabilidad si esa variable vuelve a su valor típico (la mediana del entrenamiento).
        variantes = []
        for c in NUMERICAS:
            fila = dict(base.iloc[0])
            fila[c] = self._retraso["medianas"][c]
            variantes.append(fila)
        aportes = probabilidad - modelo.predict_proba(pd.DataFrame(variantes, columns=columnas))[:, 1]
        factores = sorted(
            (
                {"nombre": NOMBRES[c], "aporte": round(float(a), 3)}
                for c, a in zip(NUMERICAS, aportes, strict=True)
                if a > 0.01
            ),
            key=lambda f: -f["aporte"],
        )[:3]
        return Prediccion(probabilidad, factores, self._retraso["version"])

    def anomalia(self, km_por_litro: float, litros: float) -> Puntaje | None:
        if self._anomalias is None:
            return None
        modelo = self._anomalias["modelo"]
        x = pd.DataFrame([[km_por_litro, litros]], columns=["kmPorLitro", "litros"])
        return Puntaje(es_anomalia=bool(modelo.predict(x)[0] == -1), puntaje=float(-modelo.score_samples(x)[0]))


def cargar_modelos(carpeta: str) -> ModelosCargados:
    def leer(nombre: str) -> dict[str, Any] | None:
        ruta = Path(carpeta) / nombre
        if not ruta.exists():
            log.warning("Sin %s: las operaciones de ML responden 503 hasta que se entrene", ruta)
            return None
        return joblib.load(ruta)

    return ModelosCargados(leer("retraso.joblib"), leer("anomalias.joblib"))
