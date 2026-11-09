#!/usr/bin/env python3
"""Historial operativo de los viajes de viajes.csv (los mismos ids que Analítica), para que el sistema parezca usado.

    python3 cargar_historial.py sql <salida.sql> <carpeta-evidencias>   SQL de Viajes y archivos para S3
    python3 cargar_historial.py gps                                     Puntos en DynamoDB (AWS_PROFILE, AWS_REGION)
    python3 cargar_historial.py finanzas <salida.sql>                   SQL de facturas y pagos de Finanzas
    python3 cargar_historial.py flota <salida.json>                     Tractos históricos y cargas para Flota

Solo inserta (`ON CONFLICT DO NOTHING`, llaves deterministas): se puede repetir. Solo biblioteca estándar.
"""

import csv
import json
import math
import random
import struct
import subprocess
import sys
import time
import uuid
import zlib
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

AQUI = Path(__file__).parent
# Analítica resolvió los `…DiasDesdeHoy` de viajes.csv con esta fecha (08/11/2026): se usa la misma para que coincidan.
HOY = date(2026, 11, 8)
NS = uuid.UUID("01934000-0000-7000-8000-00000000abcd")
BOLIVIA = timedelta(hours=-4)
DIAS_CON_GPS = 30
RETENCION_S = 90 * 86400

SANTA_CRUZ = (-17.7833, -63.1821)
CHAPARE = [(-17.34, -63.25), (-17.40, -63.88), (-17.03, -64.86), (-16.97, -65.42)]
COCHABAMBA = (-17.3895, -66.1568)
ALTIPLANO = [COCHABAMBA, (-17.64, -67.21), (-17.24, -67.92)]
LA_PAZ = (-16.5000, -68.1500)
ARICA = (-18.4783, -70.3126)
AULA = (-17.7765, -63.1951)
TRAMOS = {
    "1": [SANTA_CRUZ, *CHAPARE, COCHABAMBA],
    "2": [SANTA_CRUZ, *CHAPARE, *ALTIPLANO, LA_PAZ],
    "3": [SANTA_CRUZ, *CHAPARE, *ALTIPLANO, (-18.29, -69.06), ARICA],
    "4": [SANTA_CRUZ, (-17.72, -63.17), (-17.75, -63.20), AULA],
}
LUGARES = ["Yapacaní", "Ivirgarzama", "Villa Tunari", "Epizana", "Caracollo", "Patacamaya", "Puente Ichilo"]
CHOFERES = {"041": "Marco Quispe", "042": "René Choque", "043": "Luis Mamani", "044": "Pedro Flores"}
RECEPTORES = ["Rosa Pérez", "Juan Vargas", "Ana Rojas", "Carlos Mendoza", "Lucía Paz", "Jorge Suárez"]


def sid(*partes) -> str:
    return str(uuid.uuid5(NS, "/".join(map(str, partes))))


def filas(nombre):
    with open(AQUI / nombre, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def iso(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, datetime):
        return f"'{iso(v)}'"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def fila_sql(tabla, valores: dict) -> str:
    return f"INSERT INTO {tabla} ({', '.join(valores)}) VALUES ({', '.join(lit(v) for v in valores.values())}) ON CONFLICT DO NOTHING;"


def posicion(tramos, avance: float):
    """Punto a `avance` (0 a 1) de la polilínea, en proporción a la longitud de cada tramo."""
    largos = [math.dist(a, b) for a, b in zip(tramos, tramos[1:])]
    falta = max(0.0, min(1.0, avance)) * sum(largos)
    for (a, b), largo in zip(zip(tramos, tramos[1:]), largos):
        if falta <= largo:
            k = falta / largo
            return a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k
        falta -= largo
    return tramos[-1]


def tiempos(v):
    """Salida a las 06:00 de La Paz más el retraso; llegada tras las horas reales."""
    dia = HOY + timedelta(days=int(v["fechaViajeDiasDesdeHoy"]))
    salida = datetime(dia.year, dia.month, dia.day, 6, 0, tzinfo=UTC) - BOLIVIA
    salida += timedelta(hours=float(v["retrasoSalidaHoras"]))
    return salida, salida + timedelta(hours=float(v["horasReales"]))


def png(ancho: int, alto: int, r: random.Random, firma: bool) -> bytes:
    """Imagen simple: foto gris con textura, o trazo de firma sobre blanco."""
    filas_px = []
    if firma:
        ys = {x: int(alto / 2 + math.sin(x / 11) * alto / 4 + math.sin(x / 3) * 6) for x in range(30, ancho - 30)}
    for y in range(alto):
        fila = bytearray([0])
        for x in range(ancho):
            if firma:
                v = 20 if abs(ys.get(x, -99) - y) <= 1 else 250
            else:
                v = 120 + (y * 60 // alto) + r.randint(-14, 14)
            fila += bytes([v, v, v])
        filas_px.append(bytes(fila))

    def bloque(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos))

    return b"\x89PNG\r\n\x1a\n" + bloque(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)) + bloque(b"IDAT", zlib.compress(b"".join(filas_px), 6)) + bloque(b"IEND", b"")


def generar_sql(salida: Path, carpeta: Path) -> None:
    r = random.Random(20261108)
    foto = png(320, 240, r, False)
    firma = png(320, 120, r, True)
    facturas = {f["viajeId"]: f for f in filas("facturas.csv")}
    tractos = {c["placa"]: c["tractoId"] for c in filas("cargas.csv")}
    sql = ["BEGIN;"]
    conteo = dict(viajes=0, hitos=0, eventos=0, evidencias=0)
    for v in filas("viajes.csv"):
        vid, sv = v["viajeId"], v["servicioId"]
        salida_t, llegada = tiempos(v)
        tramos = TRAMOS[v["rutaId"][-1]]
        creado = salida_t - timedelta(hours=r.randint(18, 60))
        cliente = v["clienteId"]
        sub_cliente = "0193a000-0000-7000-8000-00000000002" + ("1" if cliente.endswith("1") else "2")
        fin = v["choferId"][-3:]
        factura = facturas[vid]
        sql.append(fila_sql("servicio", dict(servicio_id=sv, viaje_id=vid, cliente_id=cliente, cotizacion_id=sid("cot", vid),
            canal="PORTAL" if r.random() < 0.8 else "TELEFONO", creado_por=sub_cliente, workflow_id=f"historico-{sv}", confirmacion_completa=True, creado_en=creado)))
        sql.append(fila_sql("viaje", dict(viaje_id=vid, servicio_id=sv, cliente_id=cliente, cotizacion_id=sid("cot", vid), estado="CERRADO",
            ruta_id=v["rutaId"], tipo_carga=v["tipoCarga"], toneladas=float(v["toneladas"]), fecha_viaje=salida_t.date().isoformat(), monto=float(v["monto"]),
            reserva_unidad_id=sid("res", vid), tracto_id=tractos.get(v["placa"], sid("tracto", v["placa"])), remolque_id=sid("rem", v["placa"]), placa=v["placa"],
            chofer_id=v["choferId"], chofer_nombre=CHOFERES[fin], chofer_usuario_sub=f"0193a000-0000-7000-8000-0000000000{int(fin) - 30}",
            creado_en=creado, actualizado_en=llegada + timedelta(minutes=2), iniciado_en=salida_t, entregado_en=llegada, factura_id=factura["facturaId"], numero_factura=numero_fac(factura["numero"]))))
        conteo["viajes"] += 1

        horas = (llegada - salida_t).total_seconds() / 3600
        hitos = [("BLOQUEO", f"Bloqueo en {r.choice(LUGARES)}") for _ in range(int(v["bloqueos"]))]
        hitos += [("FALLA_MECANICA", r.choice(["Pinchazo en eje trasero", "Recalentamiento, se detuvo a revisar", "Falla en frenos de aire"])) for _ in range(int(v["fallas"]))]
        hitos += [("PUNTO_CONTROL", "Control de la ABC") for _ in range(r.randint(1, 2))]
        for n, (tipo, texto) in enumerate(hitos):
            k = r.uniform(0.1, 0.9)
            lat, lng = posicion(tramos, k)
            sql.append(fila_sql("hito", dict(hito_id=sid("hito", vid, n), viaje_id=vid, tipo=tipo, descripcion=texto, lat=lat, lng=lng,
                registrado_en=salida_t + timedelta(hours=horas * k), origen=r.choice(["VOZ", "TEXTO"]))))
            conteo["hitos"] += 1
        for n in range(r.choice([0, 0, 1, 1, 2, 3])):
            k = r.uniform(0.05, 0.95)
            lat, lng = posicion(tramos, k)
            fatiga = r.random() < 0.15
            sql.append(fila_sql("evento_conduccion", dict(evento_id=sid("ev", vid, n), viaje_id=vid, tipo="ALERTA_FATIGA" if fatiga else "FRENADA_BRUSCA",
                magnitud_g=None if fatiga else round(r.uniform(0.35, 0.72), 2), lat=lat, lng=lng, registrado_en=salida_t + timedelta(hours=horas * k))))
            conteo["eventos"] += 1

        ids = {"foto": sid("foto", vid), "firma": sid("firma", vid)}
        for clave, tipo, datos in (("foto", "FOTO_ENTREGA", foto), ("firma", "FIRMA", firma)):
            sql.append(fila_sql("evidencia", dict(evidencia_id=ids[clave], viaje_id=vid, tipo=tipo, content_type="image/png", tamano_bytes=len(datos),
                upload_id="historico", estado="COMPLETA", creada_en=llegada - timedelta(minutes=3), completada_en=llegada - timedelta(minutes=2))))
            archivo = carpeta / "viajes" / vid / "evidencias" / ids[clave]
            archivo.parent.mkdir(parents=True, exist_ok=True)
            archivo.write_bytes(datos)
            conteo["evidencias"] += 1
        lat, lng = tramos[-1]
        valores = dict(entrega_id=sid("ent", vid), viaje_id=vid, tipo="ENTREGA", registrada_en=llegada, lat=lat, lng=lng, precision_metros=round(r.uniform(4, 15), 1),
            distancia_metros=round(r.uniform(10, 180), 1), dentro_geocerca=True, con_firma=True, nombre_receptor=r.choice(RECEPTORES), firma_evidencia_id=ids["firma"], creada_en=llegada)
        columnas = ", ".join([*valores, "fotos"])
        datos_sql = ", ".join([*(lit(x) for x in valores.values()), f"ARRAY['{ids['foto']}']::uuid[]"])
        sql.append(f"INSERT INTO entrega ({columnas}) VALUES ({datos_sql}) ON CONFLICT DO NOTHING;")
    sql.append("COMMIT;")
    salida.write_text("\n".join(sql), encoding="utf-8")
    print(conteo)


def numero_fac(his: str) -> str:
    """Finanzas exige FAC-######: HIS-00001 pasa a FAC-100001, lejos de los números que va asignando la secuencia."""
    return f"FAC-1{his[4:]}"


def dia(relativo: str) -> str:
    return (HOY + timedelta(days=int(relativo))).isoformat()


def generar_finanzas(salida: Path) -> None:
    """Todas pagadas y con saldo 0: no tocan cuentas por cobrar ni la línea de crédito."""
    r = random.Random(20261110)
    viajes = {v["viajeId"]: v for v in filas("viajes.csv")}
    pagos = {p["facturaId"]: p for p in filas("pagos.csv")}
    sql = ["BEGIN;"]
    for f in filas("facturas.csv"):
        v, p = viajes[f["viajeId"]], pagos[f["facturaId"]]
        sql.append(fila_sql("factura", dict(factura_id=f["facturaId"], numero=numero_fac(f["numero"]), viaje_id=f["viajeId"], servicio_id=f["servicioId"], cliente_id=f["clienteId"],
            monto=float(f["monto"]), saldo=0, estado="PAGADA", emitida_el=dia(f["emitidaDiasDesdeHoy"]), vence_el=dia(f["venceDiasDesdeHoy"]), ruta_id=v["rutaId"], tipo_carga=v["tipoCarga"],
            toneladas=float(v["toneladas"]), fecha_viaje=dia(v["fechaViajeDiasDesdeHoy"]))))
        sql.append(fila_sql("pago", dict(pago_id=p["pagoId"], factura_id=f["facturaId"], monto=float(p["monto"]), fecha=dia(p["fechaDiasDesdeHoy"]), medio=r.choice(["TRANSFERENCIA", "DEPOSITO"]),
            referencia=f"HIS-{r.randint(100000, 999999)}", registrado_por="0193a000-0000-7000-8000-000000000004",
            registrado_en=datetime.fromisoformat(dia(p["fechaDiasDesdeHoy"]) + "T15:00:00+00:00"))))
    sql.append("COMMIT;")
    salida.write_text("\n".join(sql), encoding="utf-8")
    print("finanzas:", len(sql) - 2, "filas")


def generar_flota(salida: Path) -> None:
    """Tractos 61xxHIS en INACTIVA (la saga no los asigna) para que sus enlaces lleven a una ficha, y las cargas históricas."""
    r = random.Random(20261111)
    choferes = {v["viajeId"]: v["choferId"] for v in filas("viajes.csv")}
    tramos = {v["viajeId"]: TRAMOS[v["rutaId"][-1]] for v in filas("viajes.csv")}
    cargas, tractos = [], {}
    for c in filas("cargas.csv"):
        km = int(float(c["kilometraje"]))
        t = tractos.setdefault(c["tractoId"], {"placa": c["placa"], "kilometraje": km})
        t["kilometraje"] = max(t["kilometraje"], km)
        lat, lng = posicion(tramos[c["viajeId"]], r.uniform(0.1, 0.9))
        cargas.append(dict(_id=c["cargaId"], opId=sid("op", c["cargaId"]), viajeId=c["viajeId"], tractoId=c["tractoId"], placa=c["placa"], choferId=choferes[c["viajeId"]],
            litros=float(c["litros"]), monto=c["monto"], kilometraje=km, registradaEn=f"{dia(c['registradaDiasDesdeHoy'])}T{r.randint(11, 22):02d}:{r.randint(0, 59):02d}:00Z",
            posicion=dict(lat=lat, lng=lng), hashCuerpo="historico"))
    unidades = [dict(_id=i, tipoUnidad="TRACTO", placa=t["placa"], estado="INACTIVA", kilometraje=t["kilometraje"], kmDesdeUltimoMantenimiento=0,
        documentos=[], atributos=dict(capacidadTanqueLitros=600, potenciaHp=460)) for i, t in tractos.items()]
    salida.write_text(json.dumps(dict(unidades=unidades, cargas=cargas)), encoding="utf-8")
    print("flota:", len(unidades), "tractos y", len(cargas), "cargas")


def escribir_lote(items) -> None:
    pendientes = {"gps_puntos": [{"PutRequest": {"Item": i}} for i in items]}
    while pendientes:
        r = subprocess.run(["aws", "dynamodb", "batch-write-item", "--request-items", json.dumps(pendientes), "--output", "json"], capture_output=True, text=True)
        if r.returncode:
            if "Throughput" in r.stderr or "Throttl" in r.stderr:
                time.sleep(3)
                continue
            raise SystemExit(r.stderr[:500])
        pendientes = json.loads(r.stdout).get("UnprocessedItems") or {}
        if pendientes:
            time.sleep(2)


def cargar_gps() -> None:
    r = random.Random(20261109)
    viajes = [v for v in filas("viajes.csv") if int(v["fechaViajeDiasDesdeHoy"]) >= -DIAS_CON_GPS]
    total = 0
    lote = []
    # shortcut: sin sync_cursor histórico; solo sirve para reanudar una sincronización en curso, y estos viajes ya cerraron.
    for v in viajes:
        salida_t, llegada = tiempos(v)
        tramos = TRAMOS[v["rutaId"][-1]]
        duracion = (llegada - salida_t).total_seconds()
        n = max(30, min(140, int(duracion / 600)))
        paradas = {r.randrange(n) for _ in range(int(v["bloqueos"]) + int(v["fallas"]))}
        dispositivo = sid("disp", v["choferId"])
        detenido = 0.0
        for seq in range(n):
            t = salida_t + timedelta(seconds=duracion * seq / (n - 1))
            if seq in paradas:
                detenido += 1.0 / n
            k = max(0.0, seq / (n - 1) - detenido * 0.3) if seq < n - 1 else 1.0
            lat, lng = posicion(tramos, k)
            parado = seq in paradas
            lote.append({
                "viajeId": {"S": v["viajeId"]},
                "tsSeq": {"S": f"{iso(t)}#{seq:06d}"},
                "dispositivoId": {"S": dispositivo},
                "seq": {"N": str(seq)},
                "registradaEn": {"S": iso(t)},
                "lat": {"N": f"{lat + r.gauss(0, 0.0004):.6f}"},
                "lng": {"N": f"{lng + r.gauss(0, 0.0004):.6f}"},
                "velocidadKmh": {"N": "0" if parado else f"{r.uniform(38, 82):.1f}"},
                "precisionMetros": {"N": f"{r.uniform(4, 18):.1f}"},
                "expiraEn": {"N": str(int(t.timestamp()) + RETENCION_S)},
            })
            total += 1
            if len(lote) == 25:
                inicio = time.time()
                escribir_lote(lote)
                lote = []
                time.sleep(max(0.0, 1.25 - (time.time() - inicio)))  # 20 WCU de la tabla
                if total % 2500 == 0:
                    print(f"{total} puntos", flush=True)
    if lote:
        escribir_lote(lote)
    print(f"GPS: {total} puntos de {len(viajes)} viajes", flush=True)


if __name__ == "__main__":
    if sys.argv[1] == "sql":
        generar_sql(Path(sys.argv[2]), Path(sys.argv[3]))
    elif sys.argv[1] == "finanzas":
        generar_finanzas(Path(sys.argv[2]))
    elif sys.argv[1] == "flota":
        generar_flota(Path(sys.argv[2]))
    else:
        cargar_gps()
