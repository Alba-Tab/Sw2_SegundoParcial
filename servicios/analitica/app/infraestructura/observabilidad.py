"""Trazas OpenTelemetry (D23, 000 §10) y `correlationId` de lo que se está atendiendo.

Las trazas se exportan por OTLP/HTTP solo si `OTEL_EXPORTER_OTLP_ENDPOINT` está definido. Sin endpoint, la API de
OpenTelemetry no registra nada (los tramos no cuestan y las pruebas corren sin collector), pero igual continúa el
`traceparent` que trae un evento.
"""

import logging
import secrets
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from opentelemetry import propagate, trace
from opentelemetry.trace import Span, SpanKind

from app.configuracion import configuracion

log = logging.getLogger(__name__)
_tracer = trace.get_tracer("analitica")
_correlacion: ContextVar[str | None] = ContextVar("correlacion", default=None)


def iniciar(app: Any, motor: Callable[[], Any]) -> bool:
    """Exportador OTLP e instrumentación de FastAPI, httpx y SQLAlchemy. Devuelve False si no hay endpoint.

    `motor` es la fábrica del engine: solo se crea si hay que instrumentarlo.
    """
    endpoint = configuracion().otel_exporter_otlp_endpoint.strip()
    if not endpoint:
        return False
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    proveedor = TracerProvider(resource=Resource.create({"service.name": "analitica"}))
    proveedor.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint.rstrip('/')}/v1/traces")))
    trace.set_tracer_provider(proveedor)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/health")
    HTTPXClientInstrumentor().instrument()
    SQLAlchemyInstrumentor().instrument(engine=motor())
    log.info("Trazas OTLP hacia %s", endpoint)
    return True


@contextmanager
def tramo(
    nombre: str, padre: str | None = None, tipo: SpanKind = SpanKind.INTERNAL, **atributos: Any
) -> Iterator[Span]:
    """Un span hijo del actual o, con `padre`, que continúa ese `traceparent` (el de un evento consumido)."""
    contexto = propagate.extract({"traceparent": padre}) if padre else None
    valores = {k: v if isinstance(v, bool | int | float) else str(v) for k, v in atributos.items() if v is not None}
    with _tracer.start_as_current_span(nombre, context=contexto, kind=tipo, attributes=valores) as span:
        yield span


def trace_id() -> str | None:
    """El trace id del span actual, o None si no hay traza."""
    contexto = trace.get_current_span().get_span_context()
    return format(contexto.trace_id, "032x") if contexto.is_valid else None


def traceparent() -> str:
    """El `traceparent` del span actual; sin traza, uno nuevo con el formato W3C (los sobres lo exigen)."""
    portador: dict[str, str] = {}
    propagate.inject(portador)
    return portador.get("traceparent") or f"00-{secrets.token_hex(16)}-{secrets.token_hex(8)}-01"


def cabeceras_traza() -> dict[str, str]:
    """`traceparent` (si hay traza) y `X-Correlation-Id` (si hay uno) para una llamada saliente."""
    portador: dict[str, str] = {}
    propagate.inject(portador)
    if correlacion := _correlacion.get():
        portador["X-Correlation-Id"] = correlacion
    return portador


def correlacion() -> str | None:
    return _correlacion.get()


@contextmanager
def con_correlacion(valor: str | None) -> Iterator[None]:
    """Fija el `correlationId` de lo que se atiende (petición, evento o misión) mientras dura el bloque."""
    ficha = _correlacion.set(valor)
    try:
        yield
    finally:
        _correlacion.reset(ficha)
