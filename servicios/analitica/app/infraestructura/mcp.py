"""Cliente MCP (SDK v2 de Python, `mcp` 2.x): sin sesiones, una conexión por misión o por pregunta."""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx2
from mcp.client.client import Client
from mcp.client.streamable_http import streamable_http_client

from app.configuracion import configuracion


@asynccontextmanager
async def conectar(token: str, cabeceras: dict[str, str] | None = None) -> AsyncIterator[Client]:
    http = httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}", **(cabeceras or {})}, timeout=30)
    async with http, Client(streamable_http_client(configuracion().mcp_url, http_client=http)) as cliente:
        yield cliente


def resultado(r: Any) -> tuple[bool, dict[str, Any]]:
    """(es_error, datos) de un CallToolResult: structuredContent si viene; si no, el texto como JSON."""
    datos = getattr(r, "structured_content", None) or getattr(r, "structuredContent", None)
    if datos is None:
        texto = "".join(getattr(c, "text", "") for c in getattr(r, "content", []))
        try:
            datos = json.loads(texto) if texto else {}
        except ValueError:
            datos = {"texto": texto}
    return bool(getattr(r, "is_error", None) or getattr(r, "isError", None)), datos
