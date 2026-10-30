"""Consulta por voz (spec 015, A): intención del LLM validada en código → reporte por el MCP → redacción verificada."""

import json
from datetime import date
from typing import Any

from sqlalchemy import select

from app.aplicacion.consultas import hoy
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import CATALOGO, PLACA, Parametros, ReporteId, validar
from app.dominio.voz import PERIODOS, Intencion, coincidencias, fechas, numeros_validos, plantilla
from app.infraestructura.bd import Cliente, Ruta, transaccion
from app.infraestructura.llm import Llm, LlmNoDisponible
from app.infraestructura.mcp import conectar, resultado
from app.infraestructura.tokens import Tokens

ROLES_VOZ = {"gerente", "administracion", "despachador", "jefe_flota"}

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


def _opciones_catalogo(roles: set[str], primero: str | None) -> list[dict[str, Any]]:
    permitidos = [d for d in CATALOGO.values() if set(d.roles) & roles]
    permitidos.sort(key=lambda d: d.reporte_id.value != primero)
    return [{"etiqueta": d.titulo, "reporteId": d.reporte_id.value, "parametros": {}} for d in permitidos[:3]]


def validar_intencion(i: Intencion, roles: set[str], hoy_: date) -> dict[str, Any]:
    """Validación en código, en el orden de la spec 015 (paso 4). Devuelve INTENCION o ACLARACION."""
    try:
        reporte = ReporteId(i.reporte_id) if i.reporte_id else None
    except ValueError:
        reporte = None
    if reporte is None:
        raise ErrorDeDominio("PREGUNTA_FUERA_DE_ALCANCE", "Puedo responder sobre los 5 reportes del catálogo")
    if i.aclaracion:
        return {"tipo": "ACLARACION", "texto": i.aclaracion, "opciones": _opciones_catalogo(roles, reporte.value)}
    if not set(CATALOGO[reporte].roles) & roles:
        raise ErrorDeDominio("SIN_PERMISO", "No tienes permiso para ese reporte")
    d = CATALOGO[reporte]
    parametros: dict[str, Any] = {}
    with transaccion() as s:
        if i.cliente and "clienteId" in d.filtros:
            nombres = {str(c.cliente_id): c.razon_social for c in s.scalars(select(Cliente))}
            ids = coincidencias(i.cliente, nombres)
            if not ids:
                return {"tipo": "ACLARACION", "texto": f"No encontré el cliente «{i.cliente}»", "opciones": []}
            if len(ids) > 1:
                base = validar_intencion(Intencion(**{**i.__dict__, "cliente": None}), roles, hoy_)
                return {
                    "tipo": "ACLARACION",
                    "texto": f"¿Te refieres a {' o a '.join(nombres[x] for x in ids[:3])}?",
                    "opciones": [
                        {
                            "etiqueta": nombres[x],
                            "reporteId": reporte.value,
                            "parametros": {**base.get("parametros", {}), "clienteId": x},
                        }
                        for x in ids[:3]
                    ],
                }
            parametros["clienteId"] = ids[0]
        if i.ruta and "rutaId" in d.filtros:
            rutas = {str(r.ruta_id): r.nombre for r in s.scalars(select(Ruta))}
            ids = coincidencias(i.ruta, rutas)
            if len(ids) != 1:
                return {
                    "tipo": "ACLARACION",
                    "texto": f"No encontré la ruta «{i.ruta}»" if not ids else "¿Cuál de estas rutas?",
                    "opciones": [
                        {"etiqueta": rutas[x], "reporteId": reporte.value, "parametros": {"rutaId": x}} for x in ids[:3]
                    ],
                }
            parametros["rutaId"] = ids[0]
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
        except ErrorDeDominio as e:
            return {"tipo": "ACLARACION", "texto": e.mensaje, "opciones": _opciones_catalogo(roles, reporte.value)[:1]}
        parametros |= {"desde": desde.isoformat(), "hasta": hasta.isoformat()}
        try:
            validar(reporte, Parametros(desde=desde, hasta=hasta), roles)
        except ErrorDeDominio as e:
            return {"tipo": "ACLARACION", "texto": e.mensaje, "opciones": []}
    return {"tipo": "INTENCION", "reporteId": reporte.value, "parametros": parametros}


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
        return validar_intencion(_intencion(datos), roles, hoy())

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
        except BaseExceptionGroup as grupo:
            # El cliente MCP corre en un TaskGroup de anyio: se desenvuelve para responder con el código correcto.
            e: BaseException = grupo
            while isinstance(e, BaseExceptionGroup) and len(e.exceptions) == 1:
                e = e.exceptions[0]
            raise e from grupo

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
