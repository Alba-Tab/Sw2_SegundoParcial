"""Límite de peticiones por `sub` (ventana deslizante en memoria; Analítica corre en una réplica, T11.5).

La consulta por voz usa el único Ollama: un usuario no puede saturarlo. Pasado el límite → 429 LIMITE_PETICIONES con
Retry-After, igual que el servidor MCP (spec 014).
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from app.dominio.errores import ErrorDeDominio


class LimitePeticiones(ErrorDeDominio):
    def __init__(self, reintentar_en: int) -> None:
        super().__init__("LIMITE_PETICIONES", "Hiciste muchas preguntas seguidas; espera un momento")
        self.reintentar_en = reintentar_en


class Limitador:
    def __init__(self, por_minuto: int, ventana: float = 60.0, reloj: Callable[[], float] = time.monotonic) -> None:
        self.por_minuto = por_minuto
        self.ventana = ventana
        self.reloj = reloj
        self._marcas: dict[str, deque[float]] = {}
        self._cerrojo = threading.Lock()

    def registrar(self, sub: str) -> None:
        ahora = self.reloj()
        desde = ahora - self.ventana
        with self._cerrojo:
            # Se olvidan los `sub` sin peticiones en la ventana: el diccionario no crece sin fin.
            for clave in [c for c, m in self._marcas.items() if not m or m[-1] <= desde]:
                del self._marcas[clave]
            marcas = self._marcas.setdefault(sub, deque())
            while marcas and marcas[0] <= desde:
                marcas.popleft()
            if len(marcas) >= self.por_minuto:
                raise LimitePeticiones(max(1, math.ceil(marcas[0] - desde)))
            marcas.append(ahora)
