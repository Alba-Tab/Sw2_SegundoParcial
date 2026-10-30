"""Agente "vigilar viajes" (spec 014, A): razona con el LLM propio y consulta el sistema SOLO por el servidor MCP.

Propone acciones; nunca las ejecuta. Una misión a la vez (bloqueo consultivo), como máximo 8 pasos y 90 s (D09).
"""

import json
import logging
import re
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, text, update

from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import Mision, transaccion
from app.infraestructura.llm import Llm, LlmNoDisponible
from app.infraestructura.mcp import conectar, resultado
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
            trace_id=secrets.token_hex(16),
            pasos=[],
        )
        s.add(mision)
        return mision.mision_id


def cerrar(
    mision_id: uuid.UUID, estado: str, pasos: list[dict], acciones: int, codigo: str | None, conclusion: str | None
) -> None:
    with transaccion() as s:
        m = s.get(Mision, mision_id)
        if m is None:
            return
        m.estado, m.pasos, m.acciones_creadas = estado, pasos, acciones
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
    tool_calls: se reconoce `{"name", "arguments"}` o los argumentos de proponer_accion."""
    llamadas = []
    for bloque in re.findall(r"\{.*\}", contenido or "", flags=re.S):
        try:
            obj = json.loads(bloque)
        except ValueError:
            continue
        if isinstance(obj, dict) and obj.get("name") in nombres:
            llamadas.append({"function": {"name": obj["name"], "arguments": obj.get("arguments") or {}}})
        elif isinstance(obj, dict) and obj.get("tipo") == "AVISAR_CLIENTE_RETRASO" and "proponer_accion" in nombres:
            llamadas.append({"function": {"name": "proponer_accion", "arguments": obj}})
    return llamadas


def _resumen(datos: Any) -> str:
    texto = json.dumps(datos, ensure_ascii=False)
    return texto if len(texto) <= 240 else texto[:237] + "…"


def _argumentos_auditables(nombre: str, args: dict) -> dict:
    """Los pasos se muestran en el panel: sin el texto del mensaje al cliente."""
    if nombre == "proponer_accion":
        return {"viajeId": args.get("viajeId"), "destinatario": args.get("destinatario")}
    return args


class Agente:
    def __init__(self, llm: Llm | None = None, tokens: Tokens | None = None) -> None:
        self.llm = llm or Llm()
        self.tokens = tokens or Tokens()

    async def correr(self, mision_id: uuid.UUID) -> str:
        pasos: list[dict] = []
        acciones = 0
        inicio = time.monotonic()
        try:
            token = await self.tokens.del_agente()
            async with conectar(token, {"X-Mision-Id": str(mision_id)}) as mcp:
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
                while True:
                    if len(pasos) >= MAX_PASOS or time.monotonic() - inicio > MAX_SEGUNDOS:
                        cerrar(mision_id, "AGOTADA", pasos, acciones, "LIMITE", None)
                        return "AGOTADA"
                    respuesta = await self.llm.chat(mensajes, herramientas)
                    nombres = {h["function"]["name"] for h in herramientas}
                    llamadas = respuesta.get("tool_calls") or llamadas_en_texto(respuesta.get("content", ""), nombres)
                    mensajes.append(
                        {"role": "assistant", "content": respuesta.get("content", ""), "tool_calls": llamadas}
                    )
                    if not llamadas:
                        cerrar(mision_id, "COMPLETADA", pasos, acciones, None, respuesta.get("content"))
                        return "COMPLETADA"
                    for llamada in llamadas:
                        if len(pasos) >= MAX_PASOS:
                            break
                        nombre = llamada["function"]["name"]
                        args = llamada["function"].get("arguments") or {}
                        if isinstance(args, str):
                            args = json.loads(args or "{}")
                        t0 = time.monotonic()
                        try:
                            es_error, datos = resultado(await mcp.call_tool(nombre, args))
                        except Exception as e:  # herramienta desconocida (-32602) o argumentos que el SDK rechaza
                            es_error, datos = True, {"codigo": "VALIDACION", "mensaje": str(e)[:200]}
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
                        mensajes.append(
                            {
                                "role": "tool",
                                "tool_name": nombre,
                                "content": json.dumps(datos, ensure_ascii=False)[:6000],
                            }
                        )
        except Exception as envuelto:
            e = _raiz(envuelto)
            if isinstance(e, LlmNoDisponible):
                cerrar(mision_id, "FALLIDA", pasos, acciones, "LLM_NO_DISPONIBLE", "El LLM no respondió a tiempo")
            elif isinstance(e, ErrorToken):
                cerrar(mision_id, "FALLIDA", pasos, acciones, "DEPENDENCIA_NO_DISPONIBLE", str(e))
            else:
                log.exception("Misión %s falló", mision_id)
                cerrar(mision_id, "FALLIDA", pasos, acciones, "ERROR_INTERNO", str(e)[:300])
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
