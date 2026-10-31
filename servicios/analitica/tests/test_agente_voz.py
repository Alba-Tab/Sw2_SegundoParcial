"""Agente (spec 014) con un LLM y un MCP falsos, y validación de la intención de voz (spec 015)."""

import asyncio
from contextlib import asynccontextmanager
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import func, select

from app.api.limite import Limitador, LimitePeticiones
from app.aplicacion import agente, voz
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import Parametros, ReporteId, validar
from app.dominio.voz import Intencion
from app.infraestructura.bd import Mision, transaccion
from app.infraestructura.llm import LlmNoDisponible
from app.infraestructura.observabilidad import cabeceras_traza, con_correlacion
from app.infraestructura.tokens import Tokens
from tests.conftest import ejemplo, token
from tests.test_acciones import en_ruta
from tests.test_alertas import procesar

# Un proveedor real con exportador en memoria: se ven los spans sin collector (D23).
EXPORTADOR = InMemorySpanExporter()
if not isinstance(trace.get_tracer_provider(), TracerProvider):
    _proveedor = TracerProvider()
    _proveedor.add_span_processor(SimpleSpanProcessor(EXPORTADOR))
    trace.set_tracer_provider(_proveedor)

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


def test_llamada_en_texto_seguida_de_texto_o_dos_llamadas():
    nombres = {"proponer_accion", "buscar_bitacora"}
    seguida = '{"name": "buscar_bitacora", "arguments": {"viajeId": "v"}} Después reviso el riesgo {de ese viaje}.'
    assert [ll["function"]["arguments"] for ll in agente.llamadas_en_texto(seguida, nombres)] == [{"viajeId": "v"}]
    dos = (
        '<tool_call>{"name": "buscar_bitacora", "arguments": {"viajeId": "a"}}</tool_call>\n'
        '<tool_call>{"name": "proponer_accion", "arguments": {"tipo": "AVISAR_CLIENTE_RETRASO", "viajeId": "b"}}'
        "</tool_call>"
    )
    llamadas = agente.llamadas_en_texto(dos, nombres)
    # Los argumentos de proponer_accion (que también tienen "tipo") no cuentan como una tercera llamada.
    assert [(ll["function"]["name"], ll["function"]["arguments"]["viajeId"]) for ll in llamadas] == [
        ("buscar_bitacora", "a"),
        ("proponer_accion", "b"),
    ]
    envuelta = '{"tool_call": {"name": "buscar_bitacora", "arguments": {"viajeId": "c"}}}'
    assert agente.llamadas_en_texto(envuelta, nombres)[0]["function"]["arguments"] == {"viajeId": "c"}
    assert agente.llamadas_en_texto('{"name": "rota", "arguments": {', nombres) == []


class LlmLento(LlmFalso):
    async def chat(self, mensajes, herramientas=None, formato=None):
        await asyncio.sleep(5)
        return {"content": "FIN"}


async def test_los_90_s_se_cumplen_dentro_de_un_turno(mcp, monkeypatch):
    monkeypatch.setattr(agente, "MAX_SEGUNDOS", 0.3)
    id_ = agente.abrir("MANUAL", "d1")
    assert await asyncio.wait_for(agente.Agente(LlmLento([]), TokensFalsos()).correr(id_), 2) == "AGOTADA"
    assert (mision(id_).estado, mision(id_).codigo) == ("AGOTADA", "LIMITE")


async def test_los_pasos_se_guardan_a_medida_que_avanzan_y_la_mision_tiene_su_traza(mcp):
    vistos = []
    original = mcp.call_tool

    async def call_tool(nombre, args):
        vistos.append(len(mision(id_).pasos))
        return await original(nombre, args)

    mcp.call_tool = call_tool
    EXPORTADOR.clear()
    id_ = agente.abrir("MANUAL", "d1")
    guion = [llamar("obtener_viajes_en_curso", {}), llamar("obtener_viajes_en_curso", {}), {"content": "FIN"}]
    assert await agente.Agente(LlmFalso(guion), TokensFalsos()).correr(id_) == "COMPLETADA"
    assert vistos == [0, 1]  # la segunda herramienta ya ve el primer paso guardado
    spans = {s.name: s for s in EXPORTADOR.get_finished_spans()}
    assert {"mision vigilar_viajes", "llm turno", "herramienta obtener_viajes_en_curso"} <= set(spans)
    assert mision(id_).trace_id == format(spans["mision vigilar_viajes"].context.trace_id, "032x")


def ejecutable(opcion: dict, roles: set[str]) -> None:
    """La opción corre tal cual con la consulta `reporte(id, params)` (sin el LLM): pasa `validar`."""
    p = opcion["parametros"]
    assert set(p) <= {"desde", "hasta", "clienteId", "rutaId", "placa", "agrupar", "umbral", "incluirVencidas"}
    validar(
        ReporteId(opcion["reporteId"]),
        Parametros(
            desde=date.fromisoformat(p["desde"]) if "desde" in p else None,
            hasta=date.fromisoformat(p["hasta"]) if "hasta" in p else None,
            cliente_id=p.get("clienteId"),
            ruta_id=p.get("rutaId"),
            placa=p.get("placa"),
            agrupar=p.get("agrupar", "VIAJE"),
        ),
        roles,
    )


def test_cada_opcion_de_aclaracion_se_puede_ejecutar():
    procesar(
        ejemplo("ClienteActualizado", clienteId=str(uuid4()), razonSocial="Agroexport SRL"),
        ejemplo("ClienteActualizado", clienteId=str(uuid4()), razonSocial="Agro Moroso"),
        ejemplo("RutaActualizada", rutaId=str(uuid4()), nombre="Santa Cruz - Arica"),
        ejemplo("RutaActualizada", rutaId=str(uuid4()), nombre="Santa Cruz - Cochabamba"),
    )
    gerente, hoy = {"gerente"}, date(2026, 11, 3)
    casos = [
        # El LLM pide aclaración: el catálogo del rol, con el periodo dicho o el de por defecto de cada reporte.
        Intencion("FACTURACION_POR_CLIENTE", "ULTIMOS_3_MESES", aclaracion="¿Facturación o cuentas por cobrar?"),
        # Cliente y ruta ambiguos, con y sin periodo.
        Intencion("FACTURACION_POR_CLIENTE", None, cliente="agro"),
        Intencion("RENTABILIDAD", "ESTE_MES", ruta="santa cruz", agrupar="RUTA"),
        Intencion("RENTABILIDAD", None, ruta="santa cruz"),
        Intencion("VIAJES_EN_RIESGO", None, ruta="santa cruz"),
        # Sin periodo y con un rango de más de 92 días.
        Intencion("CONSUMO_COMBUSTIBLE", None),
        Intencion("CUENTAS_POR_COBRAR", "RANGO", desde="2026-01-01", hasta="2026-12-31"),
    ]
    for i in casos:
        r = voz.validar_intencion(i, gerente, hoy)
        assert r["tipo"] == "ACLARACION" and r["opciones"], i
        for opcion in r["opciones"]:
            ejecutable(opcion, gerente)
    rutas = voz.validar_intencion(casos[2], gerente, hoy)
    assert sorted(o["etiqueta"] for o in rutas["opciones"]) == ["Santa Cruz - Arica", "Santa Cruz - Cochabamba"]
    assert rutas["opciones"][0]["parametros"] | {"rutaId": None} == {
        "desde": "2026-11-01",
        "hasta": "2026-11-30",
        "agrupar": "RUTA",
        "rutaId": None,
    }
    catalogo = voz.validar_intencion(casos[0], gerente, hoy)["opciones"]
    assert catalogo[0]["reporteId"] == "FACTURACION_POR_CLIENTE" and len(catalogo) == 3


class LlmIntencion:
    def __init__(self, intencion: str) -> None:
        self.intencion = intencion

    async def disponible(self):
        return True

    async def chat(self, mensajes, herramientas=None, formato=None):
        return {"content": self.intencion}


INTENCION_RIESGO = '{"reporteId": "VIAJES_EN_RIESGO", "periodo": null, "filtros": {}}'


def test_la_voz_corre_el_reporte_en_analitica_sin_pasar_por_el_mcp(cliente):
    en_ruta(str(uuid4()))
    gerente = token("gerente")
    cliente.app.state.voz = voz.Voz(LlmIntencion(INTENCION_RIESGO))
    r = cliente.post("/api/v1/voz/preguntas", json={"texto": "¿Qué viajes van atrasados?"}, headers=gerente)
    assert r.status_code == 200 and r.json()["tipo"] == "RESPUESTA" and r.json()["exportable"] is True
    directo = cliente.get("/api/v1/reportes/VIAJES_EN_RIESGO", headers=gerente).json()
    assert r.json()["resultado"]["filas"] == directo["filas"] and directo["filas"]


def test_un_error_inesperado_es_500_en_problem_details(monkeypatch):
    from app.main import app

    class VozRota(voz.Voz):
        async def interpretar(self, texto, roles):
            raise RuntimeError("se rompió")

    with TestClient(app, raise_server_exceptions=False) as c:
        c.app.state.voz = VozRota(LlmIntencion("{}"))
        r = c.post("/api/v1/voz/preguntas", json={"texto": "hola mundo"}, headers=token("gerente"))
    assert r.status_code == 500 and r.json()["codigo"] == "ERROR_INTERNO" and "se rompió" not in r.text


def test_cuerpos_enormes_son_413(cliente):
    url, gerente = "/api/v1/voz/preguntas", token("gerente")
    # Límite global de 256 KB: con Content-Length y en trozos (sin Content-Length).
    enorme = cliente.post(url, json={"texto": "x" * 10_000_000}, headers=gerente)
    assert enorme.status_code == 413 and enorme.headers["content-type"] == "application/problem+json"
    assert enorme.json()["codigo"] == "VALIDACION" and enorme.json()["status"] == 413
    trozos = cliente.post(
        url, content=(b" " * 65_536 for _ in range(5)), headers={**gerente, "Content-Type": "application/json"}
    )
    assert trozos.status_code == 413 and trozos.json()["codigo"] == "VALIDACION"


def test_limite_de_peticiones_de_voz_por_sub(cliente, monkeypatch):
    reloj = [0.0]
    cliente.app.state.limite_voz = Limitador(2, reloj=lambda: reloj[0])
    cliente.app.state.voz = voz.Voz(LlmIntencion(INTENCION_RIESGO))
    url, cuerpo = "/api/v1/voz/preguntas", {"texto": "¿Qué viajes van atrasados?"}
    yo, otro = token("gerente", sub="g1"), token("gerente", sub="g2")
    assert [cliente.post(url, json=cuerpo, headers=yo).status_code for _ in range(2)] == [200] * 2
    tercera = cliente.post(url, json=cuerpo, headers=yo)
    assert tercera.status_code == 429 and tercera.json()["codigo"] == "LIMITE_PETICIONES"
    assert tercera.headers["retry-after"] == "60"
    assert cliente.post(url, json=cuerpo, headers=otro).status_code == 200
    reloj[0] = 60.5
    assert cliente.post(url, json=cuerpo, headers=yo).status_code == 200
    limitador = Limitador(1, reloj=lambda: reloj[0])
    limitador.registrar("a")
    with pytest.raises(LimitePeticiones):
        limitador.registrar("a")
    reloj[0] = 200.0
    limitador.registrar("b")
    assert set(limitador._marcas) == {"b"}  # los `sub` sin peticiones recientes se olvidan


def test_disparar_mision_revisa_la_idempotencia_antes_que_el_llm(cliente, monkeypatch):
    class LlmCaido(LlmIntencion):
        async def disponible(self):
            return False

    async def no_correr(mision_id):
        return "COMPLETADA"

    monkeypatch.setattr(cliente.app.state.agente, "correr", no_correr)
    clave = {"Idempotency-Key": str(uuid4()), **token("despachador", sub="d1")}
    cliente.app.state.llm = LlmIntencion("{}")
    primera = cliente.post("/api/v1/agente/misiones", headers=clave)
    assert primera.status_code == 202
    cliente.app.state.llm = LlmCaido("{}")
    segunda = cliente.post("/api/v1/agente/misiones", headers=clave)
    assert segunda.status_code == 202 and segunda.json() == primera.json()
    with transaccion() as s:
        assert s.scalar(select(func.count()).select_from(Mision).where(Mision.estado == "SALTADA")) == 0
    nueva = cliente.post("/api/v1/agente/misiones", headers={**clave, "Idempotency-Key": str(uuid4())})
    assert nueva.status_code == 503 and nueva.json()["codigo"] == "LLM_NO_DISPONIBLE"


def test_la_documentacion_de_la_api_no_se_sirve_por_defecto(cliente):
    assert cliente.get("/docs").status_code == 404
    assert cliente.get("/openapi.json").status_code == 404


def test_cabeceras_salientes_con_correlacion():
    with con_correlacion("01933b6e-4c2a-7d10-9a3e-5f1c2b7a8dff"):
        assert cabeceras_traza()["X-Correlation-Id"] == "01933b6e-4c2a-7d10-9a3e-5f1c2b7a8dff"
    assert "X-Correlation-Id" not in cabeceras_traza()


async def test_la_cache_de_tokens_purga_los_vencidos(monkeypatch):
    class Respuesta:
        status_code = 200

        def json(self):
            return {"access_token": "nuevo", "expires_in": 300}

    class Cliente:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def post(self, url, data):
            return Respuesta()

    from app.infraestructura import tokens as modulo

    monkeypatch.setattr(modulo.httpx, "AsyncClient", Cliente)
    t = Tokens()
    t._cache = {"viejo|mcp-server|1": ("v", 0.0), "otro|mcp-server|2": ("o", 10.0)}
    assert await t.del_agente() == "nuevo"
    assert set(t._cache) == {"agente"}
