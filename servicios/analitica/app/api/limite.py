"""Límite de peticiones por `sub` (ventana deslizante en memoria; Analítica corre en una réplica, T11.5).

La consulta por voz usa el único Ollama: un usuario no puede saturarlo. Pasado el límite → 429 LIMITE_PETICIONES con
Retry-After, igual que el servidor MCP (spec 014). Además, un límite global al tamaño del cuerpo (413).
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.errores import problema
from app.dominio.errores import ErrorDeDominio

MAX_CUERPO = 256 * 1024
CUERPO_GRANDE = f"El cuerpo de la petición pasa de {MAX_CUERPO // 1024} KB"


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


class LimiteCuerpo:
    """Cuerpo de más de `maximo` bytes → 413 en Problem Details (`VALIDACION`), con o sin `Content-Length`.

    Ninguna operación de Analítica necesita más.
    """

    def __init__(self, app: ASGIApp, maximo: int = MAX_CUERPO) -> None:
        self.app = app
        self.maximo = maximo

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        largo = Headers(scope=scope).get("content-length", "")
        if largo.isdigit() and int(largo) > self.maximo:
            await problema(Request(scope), "VALIDACION", CUERPO_GRANDE, status=413)(scope, receive, send)
            return
        leidos = 0

        async def recibir() -> Message:
            # Sin Content-Length (chunked): se cuentan los bytes a medida que llegan.
            nonlocal leidos
            mensaje = await receive()
            if mensaje["type"] == "http.request":
                leidos += len(mensaje.get("body", b""))
                if leidos > self.maximo:
                    raise HTTPException(413, CUERPO_GRANDE)
            return mensaje

        await self.app(scope, recibir, send)
