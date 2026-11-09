"""Puertos de la capa de aplicación: lo que los casos de uso necesitan de afuera."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Prediccion:
    probabilidad: float
    factores: list[dict[str, float | str]]
    version: str


@dataclass(frozen=True)
class Puntaje:
    es_anomalia: bool
    puntaje: float


class Modelos(Protocol):
    """Los dos modelos de ML entrenados en el build (T8.4). `None` si no están cargados."""

    @property
    def cargados(self) -> bool: ...

    def retraso(self, variables: dict[str, float | str]) -> Prediccion | None: ...

    def anomalia(self, km_por_litro: float, litros: float) -> Puntaje | None: ...


class SinModelos:
    cargados = False

    def retraso(self, variables: dict[str, float | str]) -> Prediccion | None:
        return None

    def anomalia(self, km_por_litro: float, litros: float) -> Puntaje | None:
        return None
