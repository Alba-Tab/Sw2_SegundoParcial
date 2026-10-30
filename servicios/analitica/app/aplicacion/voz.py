"""Consulta por voz (spec 015, A): intención del LLM validada en código → reporte por el MCP → redacción verificada."""

import asyncio
import json
from dataclasses import replace
from datetime import date
from typing import Any

from sqlalchemy import select

from app.aplicacion.consultas import hoy
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import CATALOGO, PLACA, Parametros, ReporteId, validar
from app.dominio.voz import PERIODOS, Intencion, coincidencias, fechas, numeros_validos, plantilla
from app.infraestructura.bd import Cliente, Ruta, transaccion
from app.infraestructura.llm import Llm, LlmNoDisponible
from app.infraestructura.mcp import ERRORES_MCP, conectar, resultado
from app.infraestructura.tokens import ErrorToken, Tokens

ROLES_VOZ = {"gerente", "administracion", "despachador", "jefe_flota"}
# Periodo de una opción cuando el que dijo el usuario no sirve: cabe en el max_dias de cualquier reporte.
PERIODO_POR_DEFECTO = {ReporteId.CUENTAS_POR_COBRAR: "ESTA_SEMANA"}

ESQUEMA = {
    "type": "object",
    "properties": {
        "reporteId": {"type": ["string", "null"], "enum": [*[r.value for r in ReporteId], None]},
        "periodo": {"type": ["string", "null"], "enum": [*PERIODOS, None]},
        "mes": {"type": ["integer", "null"]},
        "anio": {"type": ["integer", "null"]},
        "desde": {"type": ["string", "null"]},
        "hasta": {"type": ["string", "null"]},
        "filtros": {
            "type": "object",
            "properties": {
                "clienteNombre": {"type": ["string", "null"]},
                "placa": {"type": ["string", "null"]},
                "rutaNombre": {"type": ["string", "null"]},
                "agrupar": {"type": ["string", "null"], "enum": ["VIAJE", "RUTA", None]},
            },
            "required": ["clienteNombre", "placa", "rutaNombre", "agrupar"],
        },
        "aclaracion": {"type": ["string", "null"], "maxLength": 160},
    },
    "required": ["reporteId", "periodo", "mes", "anio", "desde", "hasta", "filtros", "aclaracion"],
}


def _sistema(vocabulario: str, hoy_: date) -> str:
    catalogo = "\n".join(
        f"- {d.reporte_id.value}: {d.titulo}. {d.descripcion} Parámetros: {', '.join(d.filtros) or 'ninguno'}."
        for d in CATALOGO.values()
    )
    return f"""Convierte la pregunta de un usuario de una empresa de transporte en una intención JSON. Hoy es {hoy_.isoformat()} (America/La_Paz).
Reportes disponibles:
{catalogo}
Reglas:
- Elige reporteId solo si la pregunta corresponde a uno de esos reportes; si no, reporteId = null.
- periodo es uno de {", ".join(PERIODOS)}. Para un mes nombrado usa MES con mes (1-12) y anio solo si el usuario lo dijo. Usa RANGO solo con fechas que el usuario dijo explícitamente (YYYY-MM-DD).
- Copia en filtros solo nombres que el usuario dijo (cliente, placa, ruta). Deja en null todo lo que el usuario no dijo.
- aclaracion es null casi siempre. Úsala solo si la pregunta podría ser de dos reportes distintos y no se puede decidir; entonces escribe una pregunta corta para el usuario. Nunca expliques tu razonamiento ni repitas los datos en aclaracion.
- Si no dijo un cliente, una placa o una ruta, no es ambigua: el reporte se corre para todos.
{vocabulario}"""


def _intencion(datos: dict[str, Any]) -> Intencion:
    f = datos.get("filtros") or {}
    return Intencion(
        reporte_id=datos.get("reporteId"),
        periodo=datos.get("periodo"),
        mes=datos.get("mes"),
        anio=datos.get("anio"),
        desde=datos.get("desde"),
        hasta=datos.get("hasta"),
        cliente=f.get("clienteNombre"),
        placa=f.get("placa"),
        ruta=f.get("rutaNombre"),
        agrupar=f.get("agrupar"),
        aclaracion=datos.get("aclaracion"),
    )


def _periodo(reporte: ReporteId, i: Intencion, hoy_: date) -> dict[str, str]:
    """`desde` y `hasta` para una opción: los del periodo dicho si caben en el reporte; si no, los de por defecto."""
    d = CATALOGO[reporte]
    if d.max_dias is None:
        return {}
    try:
        desde, hasta = fechas(reporte, i, hoy_)
        if hasta < desde or (hasta - desde).days + 1 > d.max_dias:
            raise ErrorDeDominio("ACLARACION", "fuera de rango")
    except ErrorDeDominio:
        defecto = Intencion(reporte.value, PERIODO_POR_DEFECTO.get(reporte, "ULTIMOS_30_DIAS"))
        desde, hasta = fechas(reporte, defecto, hoy_)
    return {"desde": desde.isoformat(), "hasta": hasta.isoformat()}


def _etiqueta(reporte: ReporteId, parametros: dict[str, Any]) -> str:
    titulo = CATALOGO[reporte].titulo
    if "desde" not in parametros:
        return titulo
    desde, hasta = date.fromisoformat(parametros["desde"]), date.fromisoformat(parametros["hasta"])
    return f"{titulo} del {desde:%d/%m} al {hasta:%d/%m/%Y}"


def _opciones_catalogo(roles: set[str], primero: ReporteId, i: Intencion, hoy_: date) -> list[dict[str, Any]]:
    """Hasta 3 reportes que el rol puede ver, empezando por el propuesto, cada uno listo para correr sin el LLM."""
    permitidos = [d for d in CATALOGO.values() if set(d.roles) & roles]
    permitidos.sort(key=lambda d: d.reporte_id != primero)
    return [
        {"etiqueta": d.titulo, "reporteId": d.reporte_id.value, "parametros": _periodo(d.reporte_id, i, hoy_)}
        for d in permitidos[:3]
    ]


def _con_periodo_por_defecto(texto: str, reporte: ReporteId, parametros: dict[str, Any], hoy_: date) -> dict[str, Any]:
    """El periodo dicho no sirve: se pregunta y se ofrece el mismo reporte con el periodo por defecto."""
    opcion = {**parametros, **_periodo(reporte, Intencion(reporte.value, None), hoy_)}
    return {
        "tipo": "ACLARACION",
        "texto": texto,
        "opciones": [{"etiqueta": _etiqueta(reporte, opcion), "reporteId": reporte.value, "parametros": opcion}],
    }


def validar_intencion(i: Intencion, roles: set[str], hoy_: date) -> dict[str, Any]:
    """Validación en código, en el orden de la spec 015 (paso 4). Devuelve INTENCION o ACLARACION.

    Cada opción de una ACLARACION trae parámetros completos (pasa `validar`): la pantalla la corre sin el LLM.
    """
    try:
        reporte = ReporteId(i.reporte_id) if i.reporte_id else None
    except ValueError:
        reporte = None
    if reporte is None:
        raise ErrorDeDominio("PREGUNTA_FUERA_DE_ALCANCE", "Puedo responder sobre los 5 reportes del catálogo")
    if i.aclaracion:
        return {"tipo": "ACLARACION", "texto": i.aclaracion, "opciones": _opciones_catalogo(roles, reporte, i, hoy_)}
    if not set(CATALOGO[reporte].roles) & roles:
        raise ErrorDeDominio("SIN_PERMISO", "No tienes permiso para ese reporte")
    d = CATALOGO[reporte]
    clientes = rutas = None
    with transaccion() as s:
        if i.cliente and "clienteId" in d.filtros:
            clientes = {str(c.cliente_id): c.razon_social for c in s.scalars(select(Cliente))}
        if i.ruta and "rutaId" in d.filtros:
            rutas = {str(r.ruta_id): r.nombre for r in s.scalars(select(Ruta))}
    parametros: dict[str, Any] = {}
    for clave, campo, dicho, nombres in (
        ("clienteId", "cliente", i.cliente, clientes),
        ("rutaId", "ruta", i.ruta, rutas),
    ):
        if nombres is None or dicho is None:
            continue
        ids = coincidencias(dicho, nombres)
        if not ids:
            que = "el cliente" if campo == "cliente" else "la ruta"
            return {"tipo": "ACLARACION", "texto": f"No encontré {que} «{dicho}»", "opciones": []}
        if len(ids) > 1:
            # Los demás parámetros salen de la misma intención sin ese nombre (o del periodo por defecto).
            base = validar_intencion(replace(i, **{campo: None}), roles, hoy_)
            comunes = base["parametros"] if base["tipo"] == "INTENCION" else _periodo(reporte, i, hoy_)
            texto = (
                f"¿Te refieres a {' o a '.join(nombres[x] for x in ids[:3])}?"
                if campo == "cliente"
                else "¿Cuál de estas rutas?"
            )
            return {
                "tipo": "ACLARACION",
                "texto": texto,
                "opciones": [
                    {"etiqueta": nombres[x], "reporteId": reporte.value, "parametros": {**comunes, clave: x}}
                    for x in ids[:3]
                ],
            }
        parametros[clave] = ids[0]
    if i.placa and "placa" in d.filtros:
        placa = i.placa.replace(" ", "").replace("-", "").upper()
        if not PLACA.match(placa):
            return {"tipo": "ACLARACION", "texto": f"La placa «{i.placa}» no tiene el formato 1234ABC", "opciones": []}
        parametros["placa"] = placa
    if i.agrupar in ("VIAJE", "RUTA") and "agrupar" in d.filtros:
        parametros["agrupar"] = i.agrupar
    if d.max_dias is not None:
        try:
            desde, hasta = fechas(reporte, i, hoy_)
            validar(reporte, Parametros(desde=desde, hasta=hasta), roles)
        except ErrorDeDominio as e:
            return _con_periodo_por_defecto(e.mensaje, reporte, parametros, hoy_)
        parametros |= {"desde": desde.isoformat(), "hasta": hasta.isoformat()}
    return {"tipo": "INTENCION", "reporteId": reporte.value, "parametros": parametros}


def _raiz(e: BaseException) -> BaseException:
    """El cliente MCP corre en un TaskGroup de anyio: se desenvuelve para responder con el código correcto."""
    while isinstance(e, BaseExceptionGroup) and len(e.exceptions) == 1:
        e = e.exceptions[0]
    return e


class Voz:
    def __init__(self, llm: Llm | None = None, tokens: Tokens | None = None) -> None:
        self.llm = llm or Llm()
        self.tokens = tokens or Tokens()

    async def interpretar(self, texto: str, roles: set[str], vocabulario: str = "") -> dict[str, Any]:
        if not roles & ROLES_VOZ:
            raise ErrorDeDominio("SIN_PERMISO", "Tu rol no usa la consulta por voz")
        try:
            r = await self.llm.chat(
                [{"role": "system", "content": _sistema(vocabulario, hoy())}, {"role": "user", "content": texto}],
                formato=ESQUEMA,
            )
            datos = json.loads(r.get("content") or "{}")
        except (LlmNoDisponible, ValueError) as e:
            raise ErrorDeDominio("LLM_NO_DISPONIBLE", "El asistente no está disponible") from e
        # Lee las copias de clientes y rutas: fuera del bucle de eventos.
        return await asyncio.to_thread(validar_intencion, _intencion(datos), roles, hoy())

    async def redactar(self, pregunta: str, resultado_reporte: dict[str, Any], prompt: str | None = None) -> str:
        reporte = ReporteId(resultado_reporte["reporteId"])
        filas, totales = resultado_reporte.get("filas", []), resultado_reporte.get("totales", {})
        texto_prompt = prompt or (
            f'Responde en español, en hasta 3 oraciones, "{pregunta}" usando solo estos datos; cada número debe estar en filas o '
            f"totales, con formato 2.800,00:\n{json.dumps({'filas': filas[:30], 'totales': totales}, ensure_ascii=False)}"
        )
        try:
            r = await self.llm.chat([{"role": "user", "content": texto_prompt}])
            texto = (r.get("content") or "").strip()
        except LlmNoDisponible:
            texto = ""
        # Regla de números: si el LLM inventa uno (o no responde), se usa la plantilla.
        return texto if texto and numeros_validos(texto, filas, totales) else plantilla(reporte, filas, totales)

    async def preguntar(self, texto: str, roles: set[str], token_usuario: str) -> dict[str, Any]:
        """Cadena de 3 intercambios: cc-tablero → gateway → analitica → mcp-server → analitica (spec 015, paso 5)."""
        try:
            return await self._preguntar(texto, roles, token_usuario)
        except BaseException as envuelto:
            e = _raiz(envuelto)
            # Keycloak o el MCP caídos son una dependencia que no responde (503), no un error interno.
            if isinstance(e, (ErrorToken, *ERRORES_MCP)):
                raise ErrorDeDominio("DEPENDENCIA_NO_DISPONIBLE", "El servidor MCP o Keycloak no responden") from e
            if e is envuelto:
                raise
            raise e from envuelto

    async def _preguntar(self, texto: str, roles: set[str], token_usuario: str) -> dict[str, Any]:
        token_mcp = await self.tokens.para_mcp(token_usuario)
        async with conectar(token_mcp) as mcp:
            vocabulario = "".join(
                getattr(c, "text", "") for c in (await mcp.read_resource("vocabulario://negocio")).contents
            )
            interpretacion = await self.interpretar(texto, roles, vocabulario)
            if interpretacion["tipo"] == "ACLARACION":
                return {
                    "tipo": "ACLARACION",
                    "texto": interpretacion["texto"],
                    "opciones": interpretacion.get("opciones", []),
                }
            es_error, datos = resultado(
                await mcp.call_tool(
                    "ejecutar_reporte",
                    {"nombre": interpretacion["reporteId"], "parametros": interpretacion["parametros"]},
                )
            )
            if es_error:
                raise ErrorDeDominio(
                    datos.get("codigo", "DEPENDENCIA_NO_DISPONIBLE"),
                    datos.get("mensaje", "No se pudo correr el reporte"),
                )
            prompt = await mcp.get_prompt(
                "redactar_respuesta_reporte",
                {
                    "pregunta": texto,
                    "reporteId": datos["reporteId"],
                    "resultado": json.dumps(
                        {"filas": datos["filas"][:30], "totales": datos["totales"]}, ensure_ascii=False
                    ),
                },
            )
            texto_prompt = "".join(getattr(m.content, "text", "") for m in prompt.messages)
        respuesta = await self.redactar(texto, datos, texto_prompt)
        return {
            "tipo": "RESPUESTA",
            "texto": respuesta,
            "reporteId": datos["reporteId"],
            "parametros": interpretacion["parametros"],
            "resultado": datos,
            "exportable": True,
        }
