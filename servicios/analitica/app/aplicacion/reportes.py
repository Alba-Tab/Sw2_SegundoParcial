"""Los 5 reportes: los números salen del modelo de lectura y se calculan aquí, nunca en el LLM (spec 015)."""

from collections import defaultdict
from dataclasses import asdict
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.aplicacion.consultas import datos_al, hoy
from app.configuracion import ZONA
from app.dominio.errores import ErrorDeDominio
from app.dominio.reportes import CATALOGO, MAX_FILAS_PANTALLA, Parametros, ReporteId, validar
from app.infraestructura.bd import (
    CaidaCombustible,
    Cliente,
    HechoCombustible,
    HechoFactura,
    HechoViaje,
    PrediccionRetraso,
    Ruta,
)

CENTAVO = Decimal("0.01")
Fila = dict[str, Any]


def bob(valor: Decimal | float | int | None) -> str:
    return str(Decimal(str(valor or 0)).quantize(CENTAVO, rounding=ROUND_HALF_UP))


def redondear(valor: float | Decimal, decimales: int = 2) -> float:
    return float(Decimal(str(valor)).quantize(Decimal(10) ** -decimales, rounding=ROUND_HALF_UP))


def rango(p: Parametros) -> tuple[datetime, datetime]:
    assert p.desde and p.hasta
    return datetime.combine(p.desde, time.min, ZONA), datetime.combine(p.hasta + timedelta(days=1), time.min, ZONA)


def cuentas_por_cobrar(s: Session, p: Parametros) -> tuple[list[Fila], dict[str, Any], list[Fila] | None]:
    hoy_ = hoy()
    consulta = select(HechoFactura, Cliente.razon_social.label("cliente")).outerjoin(
        Cliente, Cliente.cliente_id == HechoFactura.cliente_id
    )
    consulta = consulta.where(HechoFactura.saldo > 0, HechoFactura.vence_el.between(p.desde, p.hasta))
    if p.cliente_id:
        consulta = consulta.where(HechoFactura.cliente_id == UUID(p.cliente_id))
    if not p.incluir_vencidas:
        consulta = consulta.where(HechoFactura.vence_el >= hoy_)
    filas, por_cliente, total = [], defaultdict(Decimal), Decimal(0)
    for f, cliente in s.execute(consulta.order_by(HechoFactura.vence_el, HechoFactura.numero)):
        nombre = cliente or f.razon_social or str(f.cliente_id)
        filas.append(
            {
                "cliente": nombre,
                "clienteId": str(f.cliente_id),
                "facturaId": str(f.factura_id),
                "factura": f.numero,
                "monto": bob(f.monto),
                "saldo": bob(f.saldo),
                "vencimiento": f.vence_el.isoformat(),
                "dias": (f.vence_el - hoy_).days,
                "vencida": f.vence_el < hoy_,
            }
        )
        por_cliente[nombre] += f.saldo
        total += f.saldo
    grafico = [{"cliente": c, "saldo": bob(v)} for c, v in sorted(por_cliente.items(), key=lambda x: -x[1])]
    return filas, {"saldo": bob(total), "facturas": len(filas)}, grafico


def viajes_en_riesgo(s: Session, p: Parametros) -> tuple[list[Fila], dict[str, Any], list[Fila] | None]:
    consulta = (
        select(HechoViaje, PrediccionRetraso, Cliente.razon_social, Ruta.nombre)
        .join(PrediccionRetraso, PrediccionRetraso.viaje_id == HechoViaje.viaje_id)
        .outerjoin(Cliente, Cliente.cliente_id == HechoViaje.cliente_id)
        .outerjoin(Ruta, Ruta.ruta_id == HechoViaje.ruta_id)
        .where(HechoViaje.estado == "EN_RUTA", PrediccionRetraso.probabilidad >= p.umbral)
    )
    if p.ruta_id:
        consulta = consulta.where(HechoViaje.ruta_id == UUID(p.ruta_id))
    filas = [
        {
            "viajeId": str(v.viaje_id),
            "cliente": cliente,
            "ruta": ruta,
            "placa": v.placa,
            "chofer": v.chofer_nombre,
            "probabilidad": redondear(pr.probabilidad, 4),
            "bloqueos": v.bloqueos,
            "ultimaPosicion": f"{v.ultima_lat:.5f}, {v.ultima_lng:.5f}" if v.ultima_lat is not None else None,
            "ultimaPosicionEn": v.ultima_posicion_en,
        }
        for v, pr, cliente, ruta in s.execute(consulta.order_by(PrediccionRetraso.probabilidad.desc()))
    ]
    return filas, {"viajes": len(filas)}, None


def facturacion_por_cliente(s: Session, p: Parametros) -> tuple[list[Fila], dict[str, Any], list[Fila] | None]:
    mes = func.to_char(HechoFactura.emitida_el, "YYYY-MM")
    nombre = func.coalesce(Cliente.razon_social, HechoFactura.razon_social)
    consulta = (
        select(
            nombre.label("cliente"),
            mes.label("mes"),
            func.count().label("facturas"),
            func.sum(HechoFactura.monto).label("facturado"),
            func.sum(HechoFactura.saldo).label("saldo"),
        )
        .outerjoin(Cliente, Cliente.cliente_id == HechoFactura.cliente_id)
        .where(HechoFactura.emitida_el.between(p.desde, p.hasta))
        .group_by(nombre, mes)
        .order_by(mes, nombre)
    )
    if p.cliente_id:
        consulta = consulta.where(HechoFactura.cliente_id == UUID(p.cliente_id))
    filas, tot = [], defaultdict(Decimal)
    for r in s.execute(consulta):
        cobrado = r.facturado - r.saldo
        filas.append(
            {
                "cliente": r.cliente,
                "mes": r.mes,
                "facturas": r.facturas,
                "facturado": bob(r.facturado),
                "cobrado": bob(cobrado),
                "saldo": bob(r.saldo),
            }
        )
        tot["facturado"] += r.facturado
        tot["cobrado"] += cobrado
        tot["saldo"] += r.saldo
        tot["facturas"] += r.facturas
    por_mes: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    for f in filas:
        por_mes[f["mes"]]["cobrado"] += Decimal(f["cobrado"])
        por_mes[f["mes"]]["saldo"] += Decimal(f["saldo"])
    grafico = [{"mes": m, "cobrado": bob(v["cobrado"]), "saldo": bob(v["saldo"])} for m, v in sorted(por_mes.items())]
    totales = {k: bob(v) for k, v in tot.items() if k != "facturas"} | {"facturas": int(tot["facturas"])}
    return filas, totales, grafico


def consumo_combustible(s: Session, p: Parametros) -> tuple[list[Fila], dict[str, Any], list[Fila] | None]:
    inicio, fin = rango(p)
    en_rango = (HechoCombustible.registrada_en >= inicio, HechoCombustible.registrada_en < fin)
    cargas = select(HechoCombustible).where(*en_rango)
    if p.placa:
        cargas = cargas.where(HechoCombustible.placa == p.placa)
    por_placa: dict[str, dict[str, Any]] = {}
    for c in s.scalars(cargas.order_by(HechoCombustible.placa, HechoCombustible.kilometraje)):
        a = por_placa.setdefault(
            c.placa,
            {"km": 0, "litrosRef": Decimal(0), "litros": Decimal(0), "monto": Decimal(0), "anomalias": 0, "caidas": 0},
        )
        a["litros"] += c.litros
        a["monto"] += c.monto
        a["anomalias"] += int(c.es_anomalia)
        if c.km_por_litro is not None:
            # Solo las cargas con referencia aportan km (los de la carga anterior del mismo tracto).
            a["km"] += round(float(c.km_por_litro) * float(c.litros))
            a["litrosRef"] += c.litros
    caidas = select(CaidaCombustible.placa, func.count()).where(
        CaidaCombustible.detectada_en >= inicio, CaidaCombustible.detectada_en < fin
    )
    if p.placa:
        caidas = caidas.where(CaidaCombustible.placa == p.placa)
    for placa, n in s.execute(caidas.group_by(CaidaCombustible.placa)):
        por_placa.setdefault(
            placa,
            {"km": 0, "litrosRef": Decimal(0), "litros": Decimal(0), "monto": Decimal(0), "anomalias": 0, "caidas": 0},
        )["caidas"] = n
    filas = []
    for placa, a in por_placa.items():
        km_l = redondear(a["km"] / float(a["litrosRef"]), 2) if a["litrosRef"] else None
        filas.append(
            {
                "placa": placa,
                "km": a["km"],
                "litros": redondear(a["litros"], 1),
                "kmPorLitro": km_l,
                "monto": bob(a["monto"]),
                "bobPorKm": bob(a["monto"] / a["km"]) if a["km"] else None,
                "anomalias": a["anomalias"],
                "caidas": a["caidas"],
            }
        )
    filas.sort(key=lambda f: (f["kmPorLitro"] is None, f["kmPorLitro"] or 0))
    totales = {
        "km": sum(f["km"] for f in filas),
        "litros": redondear(sum(a["litros"] for a in por_placa.values()), 1),
        "monto": bob(sum((a["monto"] for a in por_placa.values()), Decimal(0))),
        "anomalias": sum(f["anomalias"] for f in filas),
        "caidas": sum(f["caidas"] for f in filas),
    }
    return filas, totales, None


def rentabilidad(s: Session, p: Parametros) -> tuple[list[Fila], dict[str, Any], list[Fila] | None]:
    inicio, fin = rango(p)
    ingreso = (
        select(HechoFactura.viaje_id, func.sum(HechoFactura.monto).label("ingreso"))
        .group_by(HechoFactura.viaje_id)
        .subquery()
    )
    combustible = (
        select(HechoCombustible.viaje_id, func.sum(HechoCombustible.monto).label("combustible"))
        .where(HechoCombustible.viaje_id.is_not(None))
        .group_by(HechoCombustible.viaje_id)
        .subquery()
    )
    consulta = (
        select(HechoViaje, Ruta.nombre, ingreso.c.ingreso, combustible.c.combustible)
        .outerjoin(Ruta, Ruta.ruta_id == HechoViaje.ruta_id)
        .outerjoin(ingreso, ingreso.c.viaje_id == HechoViaje.viaje_id)
        .outerjoin(combustible, combustible.c.viaje_id == HechoViaje.viaje_id)
        .where(
            HechoViaje.estado.in_(("ENTREGADO", "CERRADO")),
            HechoViaje.terminado_en >= inicio,
            HechoViaje.terminado_en < fin,
        )
    )
    if p.ruta_id:
        consulta = consulta.where(HechoViaje.ruta_id == UUID(p.ruta_id))
    grupos: dict[str, dict[str, Any]] = {}
    for v, ruta, ing, comb in s.execute(consulta.order_by(HechoViaje.terminado_en)):
        if p.agrupar == "RUTA":
            clave = ruta or "Sin ruta"
        else:
            fecha = v.terminado_en.astimezone(ZONA).date().isoformat() if v.terminado_en else ""
            clave = f"{v.placa or '—'} · {ruta or 'Sin ruta'} · {fecha}"
        g = grupos.setdefault(clave, {"viajes": 0, "km": Decimal(0), "ingreso": Decimal(0), "combustible": Decimal(0)})
        g["viajes"] += 1
        g["km"] += v.km_recorridos or 0
        g["ingreso"] += ing or 0
        g["combustible"] += comb or 0
        if p.agrupar == "VIAJE":
            g["viajeId"] = str(v.viaje_id)
    filas = []
    for clave, g in grupos.items():
        margen = g["ingreso"] - g["combustible"]
        filas.append(
            {
                "grupo": clave,
                **({"viajeId": g["viajeId"]} if "viajeId" in g else {}),
                "viajes": g["viajes"],
                "km": float(g["km"]),
                "ingreso": bob(g["ingreso"]),
                "combustible": bob(g["combustible"]),
                "margen": bob(margen),
                "margenPct": redondear(margen / g["ingreso"], 4) if g["ingreso"] else None,
                "bobPorKm": bob(margen / g["km"]) if g["km"] else None,
            }
        )
    ing_t = sum((Decimal(f["ingreso"]) for f in filas), Decimal(0))
    comb_t = sum((Decimal(f["combustible"]) for f in filas), Decimal(0))
    totales = {
        "viajes": sum(f["viajes"] for f in filas),
        "ingreso": bob(ing_t),
        "combustible": bob(comb_t),
        "margen": bob(ing_t - comb_t),
        "margenPct": redondear((ing_t - comb_t) / ing_t, 4) if ing_t else None,
    }
    return filas, totales, None


EJECUTORES = {
    ReporteId.CUENTAS_POR_COBRAR: cuentas_por_cobrar,
    ReporteId.VIAJES_EN_RIESGO: viajes_en_riesgo,
    ReporteId.FACTURACION_POR_CLIENTE: facturacion_por_cliente,
    ReporteId.CONSUMO_COMBUSTIBLE: consumo_combustible,
    ReporteId.RENTABILIDAD: rentabilidad,
}


def ejecutar(
    s: Session, reporte: ReporteId, p: Parametros, roles: set[str] | frozenset[str], max_filas: int = MAX_FILAS_PANTALLA
) -> dict[str, Any]:
    validar(reporte, p, roles)
    d = CATALOGO[reporte]
    filas, totales, datos_grafico = EJECUTORES[reporte](s, p)
    if len(filas) > max_filas:
        campo = "desde" if d.max_dias else "rutaId"
        raise ErrorDeDominio(
            "VALIDACION", f"El reporte tiene {len(filas)} filas; el máximo es {max_filas}: acorta el rango", campo
        )
    grafico = {**d.grafico, **({"datos": datos_grafico} if datos_grafico is not None else {})}
    return {
        "reporteId": reporte.value,
        "titulo": d.titulo,
        "parametros": p.a_json(reporte),
        "columnas": [asdict(c) for c in d.columnas],
        "filas": filas,
        "totales": totales,
        "grafico": grafico,
        "datosAl": datos_al(s),
    }


def catalogo() -> list[dict[str, Any]]:
    from app.dominio.reportes import esquema_parametros

    return [
        {
            "reporteId": d.reporte_id.value,
            "titulo": d.titulo,
            "descripcion": d.descripcion,
            "preguntaTipica": d.pregunta,
            "roles": list(d.roles),
            "maxDias": d.max_dias,
            "parametros": esquema_parametros(d.reporte_id),
        }
        for d in CATALOGO.values()
    ]


def hoy_la_paz() -> date:
    return hoy()
