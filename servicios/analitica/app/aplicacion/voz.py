"""Consulta por voz (spec 015, A): intención del LLM validada en código → reporte en Analítica → redacción verificada."""

import asyncio
import json
from dataclasses import replace
from datetime import date
from typing import Any

from sqlalchemy import select

from app.aplicacion import reportes
from app.aplicacion.consultas import hoy
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import CATALOGO, PLACA, Parametros, ReporteId, validar
from app.dominio.voz import PERIODOS, Intencion, coincidencias, fechas, numeros_validos, plantilla
from app.infraestructura.bd import Cliente, Ruta, transaccion
from app.infraestructura.llm import Llm, LlmNoDisponible

ROLES_VOZ = {"gerente", "administracion", "despachador", "jefe_flota"}
# Periodo de una opción cuando el que dijo el usuario no sirve: cabe en el max_dias de cualquier reporte.
PERIODO_POR_DEFECTO = {ReporteId.CUENTAS_POR_COBRAR: "ESTA_SEMANA"}
# Lo que el LLM necesita para entender las preguntas, sin ejemplos (el MCP publica el mismo texto para el agente).
VOCABULARIO = """Vocabulario del negocio (transporte de carga, Santa Cruz, Bolivia)
- Zona horaria: America/La_Paz. Moneda: BOB, con 2 decimales.
- Estados del viaje: PROGRAMANDO, CONFIRMADO, EN_RUTA, ENTREGADO, CERRADO, CANCELADO, ENTREGA_OBSERVADA, ENTREGA_RECHAZADA, REQUIERE_INTERVENCION.
- "En curso": CONFIRMADO, EN_RUTA o ENTREGA_OBSERVADA. "Retrasado": la duración real supera 1,25 veces la planificada (distancia / 55 km/h).
- "Mora": el cliente tiene facturas vencidas con saldo. "Cuentas por cobrar": facturas con saldo, por fecha de vencimiento.
- Periodos: "hoy"; "esta semana" = 7 días con hoy incluido, hacia adelante en cuentas por cobrar (mira vencimientos) y hacia atrás en los demás reportes; "este mes"; "mes anterior"; un mes nombrado = ese mes del año en curso, o del anterior si todavía no llegó; "últimos 30 días"; "últimos 3 meses"."""

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


def _parametros(p: dict[str, Any]) -> Parametros:
    """Los parámetros que dejó `validar_intencion` (nombres del contrato) como Parametros del dominio."""
    return Parametros(
        desde=date.fromisoformat(p["desde"]) if p.get("desde") else None,
        hasta=date.fromisoformat(p["hasta"]) if p.get("hasta") else None,
        cliente_id=p.get("clienteId"),
        ruta_id=p.get("rutaId"),
        placa=p.get("placa"),
        agrupar=p.get("agrupar", "VIAJE"),
    )


def _correr_reporte(reporte_id: str, parametros: dict[str, Any], roles: set[str]) -> dict[str, Any]:
    with transaccion() as s:
        return reportes.ejecutar(s, ReporteId(reporte_id), _parametros(parametros), roles)


class Voz:
    def __init__(self, llm: Llm | None = None) -> None:
        self.llm = llm or Llm()

    async def interpretar(self, texto: str, roles: set[str]) -> dict[str, Any]:
        if not roles & ROLES_VOZ:
            raise ErrorDeDominio("SIN_PERMISO", "Tu rol no usa la consulta por voz")
        try:
            r = await self.llm.chat(
                [{"role": "system", "content": _sistema(VOCABULARIO, hoy())}, {"role": "user", "content": texto}],
                formato=ESQUEMA,
            )
            datos = json.loads(r.get("content") or "{}")
        except (LlmNoDisponible, ValueError) as e:
            raise ErrorDeDominio("LLM_NO_DISPONIBLE", "El asistente no está disponible") from e
        # Lee las copias de clientes y rutas: fuera del bucle de eventos.
        return await asyncio.to_thread(validar_intencion, _intencion(datos), roles, hoy())

    async def redactar(self, pregunta: str, resultado_reporte: dict[str, Any]) -> str:
        reporte = ReporteId(resultado_reporte["reporteId"])
        filas, totales = resultado_reporte.get("filas", []), resultado_reporte.get("totales", {})
        prompt = (
            f'Responde en español, en hasta 3 oraciones, la pregunta "{pregunta}" usando SOLO los datos del reporte '
            f"{reporte.value}.\nCada número que escribas debe aparecer en las filas o los totales, con formato boliviano "
            f"(2.800,00). No agregues datos que no estén.\nResultado del reporte (JSON):\n"
            f"{json.dumps({'filas': filas[:30], 'totales': totales}, ensure_ascii=False)}"
        )
        try:
            r = await self.llm.chat([{"role": "user", "content": prompt}])
            texto = (r.get("content") or "").strip()
        except LlmNoDisponible:
            texto = ""
        # Regla de números: si el LLM inventa uno (o no responde), se usa la plantilla.
        return texto if texto and numeros_validos(texto, filas, totales) else plantilla(reporte, filas, totales)

    async def preguntar(self, texto: str, roles: set[str]) -> dict[str, Any]:
        interpretacion = await self.interpretar(texto, roles)
        if interpretacion["tipo"] == "ACLARACION":
            return {
                "tipo": "ACLARACION",
                "texto": interpretacion["texto"],
                "opciones": interpretacion.get("opciones", []),
            }
        datos = await asyncio.to_thread(
            _correr_reporte, interpretacion["reporteId"], interpretacion["parametros"], roles
        )
        respuesta = await self.redactar(texto, datos)
        return {
            "tipo": "RESPUESTA",
            "texto": respuesta,
            "reporteId": datos["reporteId"],
            "parametros": interpretacion["parametros"],
            "resultado": datos,
            "exportable": True,
        }
