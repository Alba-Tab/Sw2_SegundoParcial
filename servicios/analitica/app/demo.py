"""`python -m app.demo cargar|reiniciar` (D102, T8.8): un comando, nunca un endpoint.

- `cargar`: copia `plataforma/semilla` (clientes, rutas, choferes y facturas con sus viajes históricos) y los 3 meses
  de `plataforma/datos-sinteticos` directo en la base, sin eventos. Idempotente.
- `reiniciar`: vacía todo (Inbox, Outbox, hechos, alertas, acciones, misiones) y vuelve a cargar.
Las fechas `…DiasDesdeHoy` se resuelven con la fecha de hoy en America/La_Paz.
"""

import csv
import json
import sys
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.configuracion import ZONA, configuracion
from app.dominio.combustible import km_por_litro
from app.infraestructura.bd import (
    Chofer,
    Cliente,
    HechoCombustible,
    HechoFactura,
    HechoPago,
    HechoViaje,
    Ruta,
    transaccion,
)
from app.infraestructura.ml import cargar_modelos

# Versión 0: el primer ClienteActualizado, RutaActualizada o ChoferActualizado real (versión ≥ 1) las reemplaza.
VERSION_SEMILLA = 0


def carpeta(nombre: str) -> Path:
    # En la imagen están en /app; en el repo, en plataforma/.
    for raiz in (Path("/app"), *(p / "plataforma" for p in Path(__file__).resolve().parents)):
        if (raiz / nombre).is_dir():
            return raiz / nombre
    raise SystemExit(f"No encuentro {nombre}")


def dia(dias: str | int) -> date:
    return datetime.now(ZONA).date() + timedelta(days=int(dias))


def instante(d: date, hora: float = 7.0) -> datetime:
    return datetime.combine(d, time.min, ZONA) + timedelta(hours=hora)


def upsert(s: Session, modelo: type, llave: str, filas: list[dict]) -> None:
    if filas:
        s.execute(insert(modelo).values(filas).on_conflict_do_nothing(index_elements=[llave]))


def semilla(s: Session) -> None:
    raiz = carpeta("semilla")
    leer = lambda n: json.loads((raiz / f"{n}.json").read_text("utf-8"))  # noqa: E731
    upsert(
        s,
        Cliente,
        "cliente_id",
        [
            {
                "cliente_id": UUID(c["clienteId"]),
                "version": VERSION_SEMILLA,
                "razon_social": c["razonSocial"],
                "nit": c.get("nit"),
                "correo": c.get("correo"),
            }
            for c in leer("clientes")
        ],
    )
    upsert(
        s,
        Ruta,
        "ruta_id",
        [
            {
                "ruta_id": UUID(r["rutaId"]),
                "version": VERSION_SEMILLA,
                "nombre": r["nombre"],
                "origen_nombre": r["origen"]["nombre"],
                "destino_nombre": r["destino"]["nombre"],
                "origen_lat": r["origen"]["coordenadas"]["lat"],
                "origen_lng": r["origen"]["coordenadas"]["lng"],
                "destino_lat": r["destino"]["coordenadas"]["lat"],
                "destino_lng": r["destino"]["coordenadas"]["lng"],
                "distancia_km": Decimal(str(r["distanciaKm"])),
            }
            for r in leer("rutas")
        ],
    )
    upsert(
        s,
        Chofer,
        "chofer_id",
        [
            {
                "chofer_id": UUID(c["choferId"]),
                "version": VERSION_SEMILLA,
                "nombre": c["nombre"],
                "usuario_sub": c["usuarioSub"],
            }
            for c in leer("choferes")
        ],
    )
    facturas = leer("facturas")
    upsert(
        s,
        HechoViaje,
        "viaje_id",
        [
            {
                "viaje_id": UUID(f["viajeId"]),
                "servicio_id": UUID(f["servicioId"]),
                "cliente_id": UUID(f["clienteId"]),
                "ruta_id": UUID(f["rutaId"]),
                "tipo_carga": f["tipoCarga"],
                "toneladas": Decimal(str(f["toneladas"])),
                "fecha_viaje": dia(f["fechaViajeDiasDesdeHoy"]),
                "monto": Decimal(f["monto"]),
                "estado": "CERRADO",
                "terminado_en": instante(dia(f["emitidaElDiasDesdeHoy"]), 12),
            }
            for f in facturas
        ],
    )
    upsert(
        s,
        HechoFactura,
        "factura_id",
        [
            {
                "factura_id": UUID(f["facturaId"]),
                "numero": f["numero"],
                "viaje_id": UUID(f["viajeId"]),
                "servicio_id": UUID(f["servicioId"]),
                "cliente_id": UUID(f["clienteId"]),
                "monto": Decimal(f["monto"]),
                "saldo": Decimal(f["saldo"]),
                "emitida_el": dia(f["emitidaElDiasDesdeHoy"]),
                "vence_el": dia(f["venceElDiasDesdeHoy"]),
                "estado": "PAGADA" if Decimal(f["saldo"]) == 0 else "EMITIDA",
            }
            for f in facturas
        ],
    )


def sinteticos(s: Session) -> None:
    raiz = carpeta("datos-sinteticos")
    leer = lambda n: list(csv.DictReader((raiz / f"{n}.csv").open(encoding="utf-8")))  # noqa: E731
    viajes = []
    for v in leer("viajes"):
        salida = instante(dia(v["fechaViajeDiasDesdeHoy"]), 7 + float(v["retrasoSalidaHoras"]))
        viajes.append(
            {
                "viaje_id": UUID(v["viajeId"]),
                "servicio_id": UUID(v["servicioId"]),
                "cliente_id": UUID(v["clienteId"]),
                "ruta_id": UUID(v["rutaId"]),
                "tipo_carga": v["tipoCarga"],
                "toneladas": Decimal(v["toneladas"]),
                "fecha_viaje": dia(v["fechaViajeDiasDesdeHoy"]),
                "monto": Decimal(v["monto"]),
                "placa": v["placa"],
                "chofer_id": UUID(v["choferId"]),
                "estado": "CERRADO",
                "iniciado_en": salida,
                "terminado_en": salida + timedelta(hours=float(v["horasReales"])),
                "bloqueos": int(v["bloqueos"]),
                "fallas": int(v["fallas"]),
                "km_recorridos": Decimal(v["kmRecorridos"]),
            }
        )
    for i in range(0, len(viajes), 500):
        upsert(s, HechoViaje, "viaje_id", viajes[i : i + 500])
    modelos = cargar_modelos(configuracion().modelos_dir)
    anterior: dict[str, int] = {}
    cargas = []
    for c in leer("cargas"):  # ordenadas por placa y kilometraje
        km = int(c["kilometraje"])
        rendimiento = km_por_litro(km, anterior.get(c["placa"]), Decimal(c["litros"]))
        anterior[c["placa"]] = km
        puntaje = modelos.anomalia(float(rendimiento), float(c["litros"])) if rendimiento is not None else None
        cargas.append(
            {
                "carga_id": UUID(c["cargaId"]),
                "tracto_id": UUID(c["tractoId"]),
                "placa": c["placa"],
                "viaje_id": UUID(c["viajeId"]),
                "litros": Decimal(c["litros"]),
                "monto": Decimal(c["monto"]),
                "kilometraje": km,
                "registrada_en": instante(dia(c["registradaDiasDesdeHoy"]), 10),
                "km_por_litro": rendimiento,
                "referencia": "CON_REFERENCIA" if rendimiento is not None else "SIN_REFERENCIA",
                "puntaje_anomalia": puntaje.puntaje if puntaje else None,
                "es_anomalia": bool(puntaje.es_anomalia) if puntaje else c["anomala"] == "1",
            }
        )
    for i in range(0, len(cargas), 500):
        upsert(s, HechoCombustible, "carga_id", cargas[i : i + 500])
    facturas = [
        {
            "factura_id": UUID(f["facturaId"]),
            "numero": f["numero"],
            "viaje_id": UUID(f["viajeId"]),
            "servicio_id": UUID(f["servicioId"]),
            "cliente_id": UUID(f["clienteId"]),
            "monto": Decimal(f["monto"]),
            "saldo": Decimal(0),
            "emitida_el": dia(f["emitidaDiasDesdeHoy"]),
            "vence_el": dia(f["venceDiasDesdeHoy"]),
            "estado": "PAGADA",
        }
        for f in leer("facturas")
    ]
    for i in range(0, len(facturas), 500):
        upsert(s, HechoFactura, "factura_id", facturas[i : i + 500])
    pagos = [
        {
            "pago_id": UUID(p["pagoId"]),
            "factura_id": UUID(p["facturaId"]),
            "cliente_id": UUID(p["clienteId"]),
            "monto": Decimal(p["monto"]),
            "fecha": dia(p["fechaDiasDesdeHoy"]),
            "medio": "TRANSFERENCIA",
        }
        for p in leer("pagos")
    ]
    for i in range(0, len(pagos), 500):
        upsert(s, HechoPago, "pago_id", pagos[i : i + 500])


def vaciar(s: Session) -> None:
    tablas = s.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'")
    ).scalars()
    s.execute(text("TRUNCATE " + ", ".join(tablas) + " RESTART IDENTITY"))
    s.execute(text("INSERT INTO estado_lectura VALUES (1, NULL)"))


def main(orden: str) -> None:
    if orden not in ("cargar", "reiniciar"):
        raise SystemExit("Uso: python -m app.demo cargar|reiniciar")
    with transaccion() as s:
        if orden == "reiniciar":
            vaciar(s)
        semilla(s)
        sinteticos(s)
    print(f"Analítica: semilla y datos sintéticos cargados ({orden}) a las {datetime.now(UTC):%H:%M:%S} UTC")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "")
