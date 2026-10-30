"""Agente "vigilar viajes" (spec 014, A): razona con el LLM propio y consulta el sistema SOLO por el servidor MCP.

Propone acciones; nunca las ejecuta. Una misión a la vez (bloqueo consultivo), como máximo 8 pasos y 90 s (D09).
"""

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, text, update

from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import Mision, transaccion
from app.infraestructura.llm import Llm, LlmNoDisponible
from app.infraestructura.mcp import ERRORES_MCP, conectar, resultado
from app.infraestructura.observabilidad import con_correlacion, correlacion, trace_id, tramo
from app.infraestructura.tokens import ErrorToken, Tokens

log = logging.getLogger(__name__)
MAX_PASOS = 8
MAX_SEGUNDOS = 90
UMBRAL = 0.70
BLOQUEO = 4_201_401  # pg_advisory_xact_lock: una misión a la vez
COLGADA = timedelta(minutes=5)


def abrir(origen: str, sub: str | None) -> uuid.UUID:
    """Registra la misión EN_CURSO o responde 409 si ya hay una (spec 014, paso 2)."""
    ahora = datetime.now(UTC)
    with transaccion() as s:
        s.execute(text("SELECT pg_advisory_xact_lock(:b)"), {"b": BLOQUEO})
        # Una misión que quedó EN_CURSO por un reinicio no bloquea para siempre.
        s.execute(
            update(Mision)
            .where(Mision.estado == "EN_CURSO", Mision.iniciada_en < ahora - COLGADA)
            .values(estado="FALLIDA", codigo="INTERRUMPIDA", terminada_en=ahora)
        )
        if s.scalar(select(Mision.mision_id).where(Mision.estado == "EN_CURSO").limit(1)):
            raise ErrorDeDominio("CONFLICTO_ESTADO", "Ya hay una misión en curso")
        mision = Mision(
            mision_id=uuid.uuid4(),
            estado="EN_CURSO",
            origen=origen,
            disparada_por=sub,
            iniciada_en=ahora,
            pasos=[],
        )
        s.add(mision)
        return mision.mision_id


def avanzar(mision_id: uuid.UUID, pasos: list[dict], acciones: int, traza: str | None = None) -> None:
    """Guarda los pasos a medida que avanzan: el panel ve la misión en curso y un reinicio no los pierde."""
    with transaccion() as s:
        m = s.get(Mision, mision_id)
        if m is None or m.estado != "EN_CURSO":
            return
        m.pasos, m.acciones_creadas = list(pasos), acciones
        if traza:
            m.trace_id = traza


def cerrar(
    mision_id: uuid.UUID, estado: str, pasos: list[dict], acciones: int, codigo: str | None, conclusion: str | None
) -> None:
    with transaccion() as s:
        m = s.get(Mision, mision_id)
        if m is None:
            return
        m.estado, m.pasos, m.acciones_creadas = estado, list(pasos), acciones
        m.codigo, m.conclusion, m.terminada_en = codigo, (conclusion or "")[:2000] or None, datetime.now(UTC)


def saltar(origen: str, sub: str | None, codigo: str) -> uuid.UUID:
    """FR4: sin LLM la misión queda SALTADA y registrada."""
    with transaccion() as s:
        m = Mision(
            mision_id=uuid.uuid4(),
            estado="SALTADA",
            origen=origen,
            disparada_por=sub,
            iniciada_en=datetime.now(UTC),
            terminada_en=datetime.now(UTC),
            codigo=codigo,
            pasos=[],
        )
        s.add(m)
        return m.mision_id


def _raiz(e: BaseException) -> BaseException:
    """El cliente MCP corre en un TaskGroup de anyio: los errores llegan envueltos en un ExceptionGroup."""
    while isinstance(e, BaseExceptionGroup) and len(e.exceptions) == 1:
        e = e.exceptions[0]
    return e


def _para_llm(datos: Any) -> str:
    """Resultado de la herramienta para el siguiente turno, recortado: menos contexto, turnos más rápidos (D85)."""
    texto = json.dumps(datos, ensure_ascii=False)
    return texto if len(texto) <= 2500 else texto[:2500] + "…(recortado)"


def llamadas_en_texto(contenido: str, nombres: set[str]) -> list[dict[str, Any]]:
    """qwen3 a veces escribe la llamada como JSON en el texto (con o sin <tool_call> o bloque de código) en vez de usar
    tool_calls: se reconoce `{"name", "arguments"}` o los argumentos de proponer_accion.

    Se decodifica un objeto desde cada `{` (raw_decode), así sirve con texto después del JSON y con varios objetos. Un
    objeto reconocido se salta entero: sus argumentos no cuentan como otra llamada.
    """
    texto = contenido or ""
    decodificador = json.JSONDecoder()
    llamadas: list[dict[str, Any]] = []
    i = texto.find("{")
    while i != -1:
        siguiente = i + 1
        try:
            obj, fin = decodificador.raw_decode(texto, i)
        except ValueError:
            obj, fin = None, i
        if isinstance(obj, dict) and obj.get("name") in nombres:
            argumentos = obj.get("arguments", obj.get("parameters")) or {}
            llamadas.append({"function": {"name": obj["name"], "arguments": argumentos}})
            siguiente = fin
        elif isinstance(obj, dict) and obj.get("tipo") == "AVISAR_CLIENTE_RETRASO" and "proponer_accion" in nombres:
            llamadas.append({"function": {"name": "proponer_accion", "arguments": obj}})
            siguiente = fin
        i = texto.find("{", siguiente)
    return llamadas


def _resumen(datos: Any) -> str:
    texto = json.dumps(datos, ensure_ascii=False)
    return texto if len(texto) <= 240 else texto[:237] + "…"


def _argumentos_auditables(nombre: str, args: dict) -> dict:
    """Los pasos se muestran en el panel: sin el texto del mensaje al cliente."""
    if nombre == "proponer_accion":
        return {"viajeId": args.get("viajeId"), "destinatario": args.get("destinatario")}
    return args


class LimiteAlcanzado(Exception):
    """La misión llegó a su límite (D09): 8 pasos, o 90 s aunque sea en medio de un turno o de una herramienta."""


@asynccontextmanager
async def _plazo(inicio: float) -> AsyncIterator[None]:
    """Lo que queda de los 90 s: un turno del LLM dura min(LLM_TURNO_S, restante) y una herramienta, lo restante."""
    restante = MAX_SEGUNDOS - (time.monotonic() - inicio)
    if restante <= 0:
        raise LimiteAlcanzado
    try:
        async with asyncio.timeout(restante):
            yield
    except TimeoutError as e:
        raise LimiteAlcanzado from e


class Agente:
    def __init__(self, llm: Llm | None = None, tokens: Tokens | None = None) -> None:
        self.llm = llm or Llm()
        self.tokens = tokens or Tokens()

    async def correr(self, mision_id: uuid.UUID) -> str:
        # La misión programada no viene de una petición: su correlationId es su propio id.
        with (
            con_correlacion(correlacion() or str(mision_id)),
            tramo("mision vigilar_viajes", mision=mision_id) as span,
        ):
            estado = await self._correr(mision_id)
            span.set_attribute("estado", estado)
            return estado

    async def _correr(self, mision_id: uuid.UUID) -> str:
        pasos: list[dict] = []
        acciones = 0
        inicio = time.monotonic()
        # El trace id real de la misión (sin collector no hay traza y queda vacío).
        await asyncio.to_thread(avanzar, mision_id, pasos, acciones, trace_id())
        try:
            async with _plazo(inicio):
                token = await self.tokens.del_agente()
            async with conectar(token, {"X-Mision-Id": str(mision_id)}) as mcp:
                async with _plazo(inicio):
                    herramientas = [
                        {
                            "type": "function",
                            "function": {"name": t.name, "description": t.description, "parameters": t.input_schema},
                        }
                        for t in (await mcp.list_tools()).tools
                    ]
                    prompt = await mcp.get_prompt(
                        "mision_vigilar_viajes", {"umbralRiesgo": f"{UMBRAL:.2f}", "maxPasos": str(MAX_PASOS)}
                    )
                    vocabulario = await mcp.read_resource("vocabulario://negocio")
                sistema = "\n\n".join(
                    [
                        *(getattr(m.content, "text", "") for m in prompt.messages),
                        *(getattr(c, "text", "") for c in vocabulario.contents),
                    ]
                )
                mensajes: list[dict[str, Any]] = [
                    {"role": "system", "content": sistema},
                    {"role": "user", "content": f"Empieza la misión. Hoy es {datetime.now(UTC):%Y-%m-%d %H:%M} UTC."},
                ]
                nombres = {h["function"]["name"] for h in herramientas}
                turno = 0
                while True:
                    if len(pasos) >= MAX_PASOS:
                        raise LimiteAlcanzado
                    turno += 1
                    with tramo("llm turno", turno=turno):
                        async with _plazo(inicio):
                            respuesta = await self.llm.chat(mensajes, herramientas)
                    llamadas = respuesta.get("tool_calls") or llamadas_en_texto(respuesta.get("content", ""), nombres)
                    mensajes.append(
                        {"role": "assistant", "content": respuesta.get("content", ""), "tool_calls": llamadas}
                    )
                    if not llamadas:
                        conclusion = respuesta.get("content")
                        await asyncio.to_thread(cerrar, mision_id, "COMPLETADA", pasos, acciones, None, conclusion)
                        return "COMPLETADA"
                    for llamada in llamadas:
                        if len(pasos) >= MAX_PASOS:
                            break
                        nombre = llamada["function"]["name"]
                        args = llamada["function"].get("arguments") or {}
                        if isinstance(args, str):
                            args = json.loads(args or "{}")
                        t0 = time.monotonic()
                        with tramo(f"herramienta {nombre}", herramienta=nombre) as span:
                            async with _plazo(inicio):
                                try:
                                    es_error, datos = resultado(await mcp.call_tool(nombre, args))
                                except Exception as e:  # herramienta desconocida (-32602) o argumentos que rechaza
                                    es_error, datos = True, {"codigo": "VALIDACION", "mensaje": str(e)[:200]}
                            span.set_attribute("error", es_error)
                        if nombre == "proponer_accion" and not es_error and datos.get("creada"):
                            acciones += 1
                        pasos.append(
                            {
                                "numero": len(pasos) + 1,
                                "herramienta": nombre,
                                "argumentos": _argumentos_auditables(nombre, args),
                                "resumen": _resumen(datos),
                                "error": es_error,
                                "ms": int((time.monotonic() - t0) * 1000),
                            }
                        )
                        await asyncio.to_thread(avanzar, mision_id, pasos, acciones)
                        mensajes.append(
                            {
                                "role": "tool",
                                "tool_name": nombre,
                                "content": json.dumps(datos, ensure_ascii=False)[:6000],
                            }
                        )
        except Exception as envuelto:
            e = _raiz(envuelto)
            if isinstance(e, LimiteAlcanzado):
                await asyncio.to_thread(cerrar, mision_id, "AGOTADA", pasos, acciones, "LIMITE", None)
                return "AGOTADA"
            if isinstance(e, LlmNoDisponible):
                codigo, conclusion = "LLM_NO_DISPONIBLE", "El LLM no respondió a tiempo"
            elif isinstance(e, (ErrorToken, *ERRORES_MCP)):
                codigo, conclusion = "DEPENDENCIA_NO_DISPONIBLE", str(e)[:300]
            else:
                log.exception("Misión %s falló", mision_id)
                codigo, conclusion = "ERROR_INTERNO", str(e)[:300]
            await asyncio.to_thread(cerrar, mision_id, "FALLIDA", pasos, acciones, codigo, conclusion)
            return "FALLIDA"


def mision_json(m: Mision) -> dict[str, Any]:
    return {
        "misionId": str(m.mision_id),
        "estado": m.estado,
        "origen": m.origen,
        **({"disparadaPor": m.disparada_por} if m.disparada_por else {}),
        "iniciadaEn": m.iniciada_en,
        **({"terminadaEn": m.terminada_en} if m.terminada_en else {}),
        **({"codigo": m.codigo} if m.codigo else {}),
        **({"traceId": m.trace_id} if m.trace_id else {}),
        "accionesCreadas": m.acciones_creadas,
        "pasos": m.pasos,
        **({"conclusion": m.conclusion} if m.conclusion else {}),
    }
