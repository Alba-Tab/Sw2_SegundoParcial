"""LLM propio por HTTP (D36: Ollama con qwen3:4b-instruct). Temperatura 0 y 20 s por turno (D85, `LLM_TURNO_S`)."""

import json
from typing import Any

import httpx

from app.configuracion import configuracion
from app.infraestructura.observabilidad import cabeceras_traza


class LlmNoDisponible(Exception):
    pass


class Llm:
    def __init__(self, base_url: str | None = None, modelo: str | None = None) -> None:
        self.base = (base_url or configuracion().llm_base_url).rstrip("/")
        self.modelo = modelo or configuracion().llm_model

    async def disponible(self) -> bool:
        """Spec 014, paso 3: `GET /api/tags` en 3 s."""
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                r = await c.get(f"{self.base}/api/tags")
                return r.status_code == 200
        except httpx.HTTPError:
            return False

    async def chat(
        self, mensajes: list[dict[str, Any]], herramientas: list[dict] | None = None, formato: dict | None = None
    ) -> dict[str, Any]:
        cuerpo: dict[str, Any] = {
            "model": self.modelo,
            "messages": mensajes,
            "stream": False,
            "options": {"temperature": 0},
        }
        if herramientas:
            cuerpo["tools"] = herramientas
        if formato:
            # Siempre el esquema completo: con format = "json" el modelo omitía campos (PoC-3).
            cuerpo["format"] = formato
        try:
            async with httpx.AsyncClient(timeout=configuracion().llm_turno_s) as c:
                r = await c.post(f"{self.base}/api/chat", json=cuerpo, headers=cabeceras_traza())
                r.raise_for_status()
                return r.json()["message"]
        except (httpx.HTTPError, KeyError, json.JSONDecodeError) as e:
            raise LlmNoDisponible(str(e)) from e
