"""Configuración por variables de entorno (sin secretos en el repo: .env.example)."""

from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

ZONA = ZoneInfo("America/La_Paz")


class Configuracion(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+psycopg://analitica:analitica@localhost:5433/analitica"
    amqp_url: str = "amqp://analitica:analitica@localhost:5672/"
    consumir_eventos: bool = True
    oidc_issuer: str = ""
    audiencia: str = "analitica"
    cors_origenes: str = ""
    # Cliente confidencial `analitica` (intercambio de tokens, RFC 8693) y cliente `agente` (client credentials).
    oidc_cliente_secreto: str = ""
    agente_cliente_secreto: str = ""
    portal_url: str = "http://localhost:5173"
    # LLM compatible con OpenAI (Ollama, D36) y servidor MCP (specs 014 y 015).
    llm_base_url: str = "http://host.docker.internal:11434"
    llm_model: str = "qwen3:4b-instruct"
    mcp_url: str = "http://localhost:8106/mcp"
    modelos_dir: str = "modelos"
    contratos_dir: str = "../../contratos"
    programar_tareas: bool = True
    mision_cada_minutos: int = 10
    otel_exporter_otlp_endpoint: str = ""


@lru_cache
def configuracion() -> Configuracion:
    return Configuracion()
