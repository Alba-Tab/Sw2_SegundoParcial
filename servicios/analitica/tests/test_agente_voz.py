"""Agente (spec 014) con un LLM y un MCP falsos, y validación de la intención de voz (spec 015)."""

from contextlib import asynccontextmanager
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.aplicacion import agente, voz
from app.dominio.errores import ErrorDeDominio
from app.dominio.voz import Intencion
from app.infraestructura.bd import Mision, transaccion
from app.infraestructura.llm import LlmNoDisponible
from tests.conftest import ejemplo
from tests.test_alertas import procesar

VIAJE = str(uuid4())


class McpFalso:
    def __init__(self):
        self.llamadas = []

    async def list_tools(self):
        return SimpleNamespace(
            tools=[SimpleNamespace(name="obtener_viajes_en_curso", description="d", input_schema={"type": "object"})]
        )

    async def get_prompt(self, nombre, args):
        return SimpleNamespace(messages=[SimpleNamespace(content=SimpleNamespace(text=f"misión {args}"))])

    async def read_resource(self, uri):
        return SimpleNamespace(contents=[SimpleNamespace(text="vocabulario")])

    async def call_tool(self, nombre, args):
        self.llamadas.append((nombre, args))
        datos = (
            {"accionId": VIAJE, "estado": "PENDIENTE", "creada": True}
            if nombre == "proponer_accion"
            else {"viajes": []}
        )
        return SimpleNamespace(structured_content=datos, is_error=False, content=[])


class LlmFalso:
    def __init__(self, guion):
        self.guion = list(guion)

    async def chat(self, mensajes, herramientas=None, formato=None):
        paso = self.guion.pop(0)
        if isinstance(paso, Exception):
            raise paso
        return paso


def llamar(nombre, args):
    return {"content": "", "tool_calls": [{"function": {"name": nombre, "arguments": args}}]}


@pytest.fixture
def mcp(monkeypatch):
    falso = McpFalso()

    @asynccontextmanager
    async def conectar(token, cabeceras=None):
        falso.cabeceras = cabeceras
        yield falso

    monkeypatch.setattr(agente, "conectar", conectar)
    return falso


class TokensFalsos:
    async def del_agente(self):
        return "token-del-agente"


def mision(id_):
    with transaccion() as s:
        return s.get(Mision, id_)


async def test_mision_completa_propone_y_registra_pasos(mcp):
    guion = [
        llamar("obtener_viajes_en_curso", {}),
        llamar(
            "proponer_accion",
            {"viajeId": VIAJE, "destinatario": {"clienteId": VIAJE}, "mensaje": "texto largo del aviso al cliente"},
        ),
        {"content": "FIN"},
    ]
    id_ = agente.abrir("MANUAL", "d1")
    with pytest.raises(ErrorDeDominio, match="en curso"):
        agente.abrir("MANUAL", "d1")
    assert await agente.Agente(LlmFalso(guion), TokensFalsos()).correr(id_) == "COMPLETADA"
    m = mision(id_)
    assert (m.estado, m.acciones_creadas, m.conclusion) == ("COMPLETADA", 1, "FIN")
    assert [p["herramienta"] for p in m.pasos] == ["obtener_viajes_en_curso", "proponer_accion"]
    assert "mensaje" not in m.pasos[1]["argumentos"]  # el texto al cliente no va al panel
    assert mcp.cabeceras == {"X-Mision-Id": str(id_)}


async def test_mision_agotada_a_los_8_pasos_y_fallida_sin_llm(mcp):
    id_ = agente.abrir("PROGRAMADA", None)
    assert (
        await agente.Agente(LlmFalso([llamar("obtener_viajes_en_curso", {})] * 9), TokensFalsos()).correr(id_)
        == "AGOTADA"
    )
    assert len(mision(id_).pasos) == 8
    id2 = agente.abrir("MANUAL", "d1")
    assert await agente.Agente(LlmFalso([LlmNoDisponible("caído")]), TokensFalsos()).correr(id2) == "FALLIDA"
    assert mision(id2).codigo == "LLM_NO_DISPONIBLE"
    saltada = mision(agente.saltar("PROGRAMADA", None, "LLM_NO_DISPONIBLE"))
    assert (saltada.estado, saltada.codigo) == ("SALTADA", "LLM_NO_DISPONIBLE")


def test_intencion_de_voz_validada_en_codigo():
    procesar(
        ejemplo("ClienteActualizado", clienteId=str(uuid4()), razonSocial="Agroexport SRL"),
        ejemplo("ClienteActualizado", clienteId=str(uuid4()), razonSocial="Agro Moroso"),
    )
    gerente, hoy = {"gerente"}, date(2026, 11, 3)
    r = voz.validar_intencion(Intencion("CUENTAS_POR_COBRAR", "ESTA_SEMANA"), gerente, hoy)
    assert r == {
        "tipo": "INTENCION",
        "reporteId": "CUENTAS_POR_COBRAR",
        "parametros": {"desde": "2026-11-03", "hasta": "2026-11-09"},
    }
    ambigua = voz.validar_intencion(Intencion("FACTURACION_POR_CLIENTE", "MES", mes=10, cliente="agro"), gerente, hoy)
    assert ambigua["tipo"] == "ACLARACION" and sorted(o["etiqueta"] for o in ambigua["opciones"]) == [
        "Agro Moroso",
        "Agroexport SRL",
    ]
    assert ambigua["opciones"][0]["parametros"]["desde"] == "2026-10-01"
    with pytest.raises(ErrorDeDominio) as e:
        voz.validar_intencion(Intencion(None, None), gerente, hoy)
    assert e.value.codigo == "PREGUNTA_FUERA_DE_ALCANCE"
    with pytest.raises(ErrorDeDominio) as e:
        voz.validar_intencion(Intencion("CUENTAS_POR_COBRAR", "ESTA_SEMANA"), {"jefe_flota"}, hoy)
    assert e.value.codigo == "SIN_PERMISO"
    largo = voz.validar_intencion(
        Intencion("CUENTAS_POR_COBRAR", "RANGO", desde="2026-01-01", hasta="2026-12-31"), gerente, hoy
    )
    assert largo["tipo"] == "ACLARACION" and "92" in largo["texto"]


def test_llamada_escrita_como_texto():
    nombres = {"proponer_accion", "buscar_bitacora"}
    texto = '<tool_call>{"name": "buscar_bitacora", "arguments": {"viajeId": "v", "texto": "bloqueo"}}</tool_call>'
    assert agente.llamadas_en_texto(texto, nombres) == [
        {"function": {"name": "buscar_bitacora", "arguments": {"viajeId": "v", "texto": "bloqueo"}}}
    ]
    crudo = '```json\n{"tipo": "AVISAR_CLIENTE_RETRASO", "viajeId": "v", "mensaje": "m"}\n```'
    assert agente.llamadas_en_texto(crudo, nombres)[0]["function"]["name"] == "proponer_accion"
    assert agente.llamadas_en_texto("FIN", nombres) == []
