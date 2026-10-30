"""Tres meses de historia sintética para Analítica (T8.5), con semilla fija y fechas relativas a hoy.

    python3 generar.py            # escribe los CSV de esta carpeta

Solo usa la biblioteca estándar. Los ids son propios (prefijo 01934000-) y no chocan con plataforma/semilla: las
cargas usan tractos históricos (nunca 4521KTR, que en FF2 no tiene cargas previas) y todas las facturas están
pagadas, así que no cambian cuentas por cobrar ni la mora de la demo.
"""

import csv
import math
import random
import uuid
from pathlib import Path

SEMILLA = 42
DIAS = 90
VIAJES = 640
CARPETA = Path(__file__).parent
VELOCIDAD_PLAN = 55

RUTAS = [
    ("01933a00-0000-7000-8000-000000000001", 470, 0.35, 2600),
    ("01933a00-0000-7000-8000-000000000002", 850, 0.35, 4300),
    ("01933a00-0000-7000-8000-000000000003", 1300, 0.12, 7200),
    ("01933a00-0000-7000-8000-000000000004", 120, 0.18, 900),
]
CLIENTES = ["0193a000-0000-7000-8000-0000000c0001", "0193a000-0000-7000-8000-0000000c0002"]
CHOFERES = [f"01933c00-0000-7000-8000-00000000004{i}" for i in range(1, 5)]
PLACAS = ["6101HIS", "6102HIS", "6103HIS", "6104HIS", "6105HIS", "6106HIS", "6107HIS", "6108HIS"]
TIPOS = ["GRANOS", "INSUMOS", "INSUMOS_LIQUIDOS", "CONTENEDOR"]
FACTOR_CARGA = {"GRANOS": 1.0, "INSUMOS": 1.1, "INSUMOS_LIQUIDOS": 1.25, "CONTENEDOR": 1.15}

azar = random.Random(SEMILLA)


def uid(n: int, tipo: int) -> str:
    return str(uuid.UUID(f"01934000-{tipo:04x}-7000-8000-{n:012x}"))


def paradas(bloqueos: int, fallas: int, horas: float) -> list[tuple[float, float, str]]:
    """Paradas (inicio en horas desde la salida, duración en horas, tipo) repartidas en el viaje."""
    lista = [(azar.uniform(0.1, 0.8) * horas, azar.uniform(1.0, 3.5), "BLOQUEO") for _ in range(bloqueos)]
    lista += [(azar.uniform(0.1, 0.8) * horas, azar.uniform(0.8, 2.5), "FALLA_MECANICA") for _ in range(fallas)]
    return sorted(lista)


def instantanea(t: float, distancia: float, real: float, stops: list[tuple[float, float, str]]) -> dict:
    """Lo que el modelo vería a las t horas: avance, bloqueos ya registrados y minutos detenido en la última hora."""
    detenido_total = sum(d for _, d, _ in stops)
    velocidad = distancia / max(0.5, real - detenido_total)
    detenido_hasta_t = sum(max(0.0, min(t, i + d) - i) for i, d, _ in stops if i < t)
    avance = min(1.0, velocidad * (t - detenido_hasta_t) / distancia)
    ultima_hora = sum(max(0.0, min(t, i + d) - max(t - 1, i)) for i, d, _ in stops if i < t and i + d > t - 1)
    return {
        "fraccionRecorrida": round(avance, 3),
        "horasTranscurridas": round(t, 2),
        "bloqueos": sum(1 for i, _, k in stops if i < t and k == "BLOQUEO"),
        "fallas": sum(1 for i, _, k in stops if i < t and k == "FALLA_MECANICA"),
        "minutosDetenido": round(min(60.0, ultima_hora * 60), 1),
    }


def main() -> None:
    viajes, muestras, cargas, facturas, pagos = [], [], [], [], []
    odometro = {p: azar.randint(90_000, 260_000) for p in PLACAS}
    for n in range(VIAJES):
        ruta, distancia, _, tarifa = azar.choices(RUTAS, weights=[r[2] for r in RUTAS])[0]
        patron_simulador = n % 16 == 0  # D80 + spec 013: 6 h en ruta, 2 bloqueos, la última hora detenido
        tipo = azar.choice(TIPOS)
        toneladas = round(azar.uniform(10, 30), 1)
        planificadas = distancia / VELOCIDAD_PLAN
        retraso_salida = round(azar.gauss(0.4, 1.3), 2)
        bloqueos = 2 if patron_simulador else min(4, int(azar.expovariate(1 / 0.45)))
        fallas = 0 if patron_simulador else (1 if azar.random() < 0.08 else 0)
        stops = paradas(bloqueos, fallas, planificadas)
        if patron_simulador:
            stops = [(2.0, 1.5, "BLOQUEO"), (4.9, 3.0, "BLOQUEO")]
        factor = max(0.9, azar.gauss(1.06, 0.07)) + 0.04 * max(0.0, retraso_salida)
        real = planificadas * factor + sum(d for _, d, _ in stops)
        retrasado = real > 1.25 * planificadas
        dias = -azar.randint(2, DIAS)
        placa = azar.choice(PLACAS)
        viaje_id = uid(n, 1)
        cliente = azar.choice(CLIENTES)
        monto = round(tarifa * FACTOR_CARGA[tipo], 2)
        km = round(distancia * azar.uniform(0.98, 1.04))
        viajes.append(
            {
                "viajeId": viaje_id,
                "servicioId": uid(n, 2),
                "clienteId": cliente,
                "rutaId": ruta,
                "placa": placa,
                "choferId": azar.choice(CHOFERES),
                "tipoCarga": tipo,
                "toneladas": toneladas,
                "fechaViajeDiasDesdeHoy": dias,
                "retrasoSalidaHoras": retraso_salida,
                "horasReales": round(real, 2),
                "kmRecorridos": km,
                "bloqueos": bloqueos,
                "fallas": fallas,
                "monto": f"{monto:.2f}",
                "retrasado": int(retrasado),
            }
        )
        # Varias instantáneas por viaje: el modelo predice durante el recorrido, no al final.
        tiempos = [6.0] if patron_simulador else [real * f for f in (0.15, 0.35, 0.55, 0.75)]
        for t in tiempos:
            vista = instantanea(t, distancia, real, stops)
            if patron_simulador:
                vista["minutosDetenido"] = 60.0
            muestras.append(
                {
                    "viajeId": viaje_id,
                    "distanciaKm": distancia,
                    **vista,
                    "horasPlanificadas": round(planificadas, 2),
                    "retrasoSalidaHoras": retraso_salida,
                    "toneladas": toneladas,
                    "tipoCarga": tipo,
                    "retrasado": int(retrasado),
                }
            )
        # Una o dos cargas por viaje; ~5 % con un rendimiento imposible (anomalía).
        for parte in range(1 if distancia < 600 else 2):
            tramo = km if distancia < 600 else round(km / 2)
            anomala = azar.random() < 0.05
            rendimiento = azar.uniform(0.25, 1.1) if anomala else max(1.6, azar.gauss(2.4, 0.2))
            litros = round(min(600, tramo / rendimiento), 1)
            odometro[placa] += tramo
            cargas.append(
                {
                    "cargaId": uid(n * 2 + parte, 3),
                    "tractoId": str(uuid.uuid5(uuid.NAMESPACE_URL, placa)),
                    "placa": placa,
                    "viajeId": viaje_id,
                    "litros": litros,
                    "monto": f"{litros * 3.74:.2f}",
                    "kilometraje": odometro[placa],
                    "registradaDiasDesdeHoy": dias + (1 if parte else 0),
                    "anomala": int(anomala),
                }
            )
        facturas.append(
            {
                "facturaId": uid(n, 4),
                "numero": f"HIS-{n + 1:05d}",
                "viajeId": viaje_id,
                "servicioId": uid(n, 2),
                "clienteId": cliente,
                "monto": f"{monto:.2f}",
                "emitidaDiasDesdeHoy": dias + math.ceil(real / 24),
                "venceDiasDesdeHoy": dias + math.ceil(real / 24) + 30,
            }
        )
        pagos.append(
            {
                "pagoId": uid(n, 5),
                "facturaId": uid(n, 4),
                "clienteId": cliente,
                "monto": f"{monto:.2f}",
                "fechaDiasDesdeHoy": min(-1, dias + azar.randint(5, 40)),
            }
        )
    for nombre, filas in [
        ("viajes", viajes),
        ("muestras-retraso", muestras),
        ("cargas", sorted(cargas, key=lambda c: (c["placa"], c["kilometraje"]))),
        ("facturas", facturas),
        ("pagos", pagos),
    ]:
        with (CARPETA / f"{nombre}.csv").open("w", newline="", encoding="utf-8") as f:
            escritor = csv.DictWriter(f, fieldnames=list(filas[0]))
            escritor.writeheader()
            escritor.writerows(filas)
    print(f"{len(viajes)} viajes, {len(muestras)} muestras, {len(cargas)} cargas, {len(facturas)} facturas")


if __name__ == "__main__":
    main()
