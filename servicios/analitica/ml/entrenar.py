"""Entrena los dos modelos con semilla fija (T8.4). Corre en el build de la imagen y en el notebook.

    python -m ml.entrenar --datos ../../plataforma/datos-sinteticos --salida modelos

- Retraso (D81): GradientBoostingClassifier(random_state=42) sobre las variables de D79; meta recall ≥ 0,75 (D82).
- Anomalías (D09): IsolationForest(contamination=0.05, n_estimators=100, random_state=42) sobre [kmPorLitro, litros].
"""

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest
from sklearn.metrics import confusion_matrix, precision_score, recall_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.utils.class_weight import compute_sample_weight

from app.dominio.retraso import CATEGORICAS, NUMERICAS, TIPOS_CARGA

SEMILLA = 42
VERSION_RETRASO = "gb-1"
VERSION_ANOMALIAS = "if-1"


def muestras(datos: Path) -> pd.DataFrame:
    return pd.read_csv(datos / "muestras-retraso.csv")


def cargas_con_referencia(datos: Path) -> pd.DataFrame:
    c = pd.read_csv(datos / "cargas.csv").sort_values(["placa", "kilometraje"])
    c["kmPorLitro"] = c.groupby("placa")["kilometraje"].diff() / c["litros"]
    return c.dropna(subset=["kmPorLitro"])


def modelo_retraso() -> Pipeline:
    columnas = ColumnTransformer(
        [("tipo", OneHotEncoder(categories=[list(TIPOS_CARGA)], handle_unknown="ignore"), list(CATEGORICAS))],
        remainder="passthrough",
    )
    return Pipeline([("columnas", columnas), ("gb", GradientBoostingClassifier(random_state=SEMILLA))])


def entrenar_retraso(m: pd.DataFrame) -> tuple[dict[str, Any], dict[str, Any]]:
    columnas = [*NUMERICAS, *CATEGORICAS]
    # Las muestras de un mismo viaje van juntas a entrenamiento o a validación.
    entrena, valida = next(GroupShuffleSplit(test_size=0.25, random_state=SEMILLA).split(m, groups=m["viajeId"]))
    x, y = m[columnas], m["retrasado"]
    # Los retrasados son ~14 %: pesos balanceados para no perderlos (la meta es recall, D82).
    pesos = compute_sample_weight("balanced", y)
    validacion = modelo_retraso().fit(x.iloc[entrena], y.iloc[entrena], gb__sample_weight=pesos[entrena])
    prediccion = validacion.predict(x.iloc[valida])
    metricas = {
        "recall": round(float(recall_score(y.iloc[valida], prediccion)), 3),
        "precision": round(float(precision_score(y.iloc[valida], prediccion)), 3),
        "matriz": confusion_matrix(y.iloc[valida], prediccion).tolist(),
        "muestras": len(m),
    }
    final = modelo_retraso().fit(x, y, gb__sample_weight=pesos)
    medianas = {c: float(m[c].median()) for c in NUMERICAS}
    return {"modelo": final, "medianas": medianas, "version": VERSION_RETRASO}, metricas


def entrenar_anomalias(c: pd.DataFrame) -> tuple[dict[str, Any], dict[str, Any]]:
    x = c[["kmPorLitro", "litros"]]
    modelo = IsolationForest(contamination=0.05, n_estimators=100, random_state=SEMILLA).fit(x)
    marcadas = modelo.predict(x) == -1
    metricas = {"cargas": len(c), "marcadas": int(marcadas.sum()), "anomalasSinteticas": int(c["anomala"].sum())}
    return {"modelo": modelo, "version": VERSION_ANOMALIAS}, metricas


def main() -> None:
    args = argparse.ArgumentParser()
    args.add_argument("--datos", type=Path, required=True)
    args.add_argument("--salida", type=Path, required=True)
    a = args.parse_args()
    a.salida.mkdir(parents=True, exist_ok=True)
    retraso, m_retraso = entrenar_retraso(muestras(a.datos))
    anomalias, m_anomalias = entrenar_anomalias(cargas_con_referencia(a.datos))
    joblib.dump(retraso, a.salida / "retraso.joblib")
    joblib.dump(anomalias, a.salida / "anomalias.joblib")
    metricas = {"retraso": m_retraso, "anomalias": m_anomalias}
    (a.salida / "metricas.json").write_text(json.dumps(metricas, indent=2))
    print(json.dumps(metricas))
    if m_retraso["recall"] < 0.75:
        raise SystemExit(f"Recall de retrasado {m_retraso['recall']} < 0,75 (D82)")


if __name__ == "__main__":
    main()
