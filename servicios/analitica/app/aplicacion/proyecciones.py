"""Consumo de eventos (spec 013, A y B): Inbox, hechos, alertas y disparos del ML, todo en una transacción."""

import logging
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.aplicacion import alertas
from app.aplicacion.prediccion import recalcular_riesgo
from app.aplicacion.puertos import Modelos
from app.dominio.alertas import TipoAlerta
from app.dominio.combustible import km_por_litro
from app.infraestructura.bd import (
    CaidaCombustible,
    Chofer,
    Cliente,
    EstadoLectura,
    HechoCombustible,
    HechoConduccion,
    HechoFactura,
    HechoMantenimiento,
    HechoPago,
    HechoViaje,
    HitoViaje,
    InboxEvento,
    PosicionViaje,
    Ruta,
)

log = logging.getLogger(__name__)
Sobre = dict[str, Any]
Datos = dict[str, Any]
RETENCION_POSICIONES = timedelta(hours=3)
ESTADOS_FINALES = ("ENTREGADO", "ENTREGA_RECHAZADA", "CANCELADO", "CERRADO")


def instante(texto: str) -> datetime:
    return datetime.fromisoformat(texto.replace("Z", "+00:00"))


def monto(m: dict[str, str] | None) -> Decimal | None:
    return Decimal(m["monto"]) if m else None


class Proyecciones:
    def __init__(self, modelos: Modelos, reloj: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.modelos = modelos
        self.reloj = reloj
        self.manejadores: dict[str, Callable[[Session, Datos, datetime, str], None]] = {
            "ClienteActualizado": self.cliente,
            "RutaActualizada": self.ruta,
            "ChoferActualizado": self.chofer,
            "ViajeConfirmado": self.viaje_confirmado,
            "ViajeIniciado": self.viaje_iniciado,
            "PosicionActualizada": self.posicion,
            "HitoRegistrado": self.hito,
            "EventoConduccionRegistrado": self.conduccion,
            "EntregaConfirmada": self.entrega_confirmada,
            "EntregaObservada": self.entrega_observada,
            "EntregaRechazada": self.entrega_rechazada,
            "ViajeCancelado": self.viaje_cancelado,
            "ViajeRequiereIntervencion": self.intervencion,
            "FacturaEmitida": self.factura,
            "PagoRegistrado": self.pago,
            "CargaCombustibleRegistrada": self.carga,
            "CaidaCombustibleDetectada": self.caida,
            "MantenimientoRequerido": self.mantenimiento,
        }

    def conoce(self, tipo: str) -> bool:
        return tipo in self.manejadores

    def procesar(self, sesion: Session, sobre: Sobre) -> bool:
        """Devuelve False si el evento ya se había procesado (Inbox por `id`)."""
        ocurrido = instante(sobre["ocurridoEn"])
        nuevo = sesion.execute(
            insert(InboxEvento)
            .values(evento_id=UUID(sobre["id"]), tipo=sobre["tipo"], ocurrido_en=ocurrido, procesado_en=self.reloj())
            .on_conflict_do_nothing()
            .returning(InboxEvento.evento_id)
        ).scalar_one_or_none()
        if nuevo is None:
            return False
        self.manejadores[sobre["tipo"]](sesion, sobre["datos"], ocurrido, f"{sobre['tipo']}:{sobre['id']}")
        sesion.execute(
            update(EstadoLectura)
            .where(EstadoLectura.id == 1)
            .values(datos_al=ocurrido)
            .where((EstadoLectura.datos_al.is_(None)) | (EstadoLectura.datos_al < ocurrido))
        )
        return True

    # ------------------------------------------------------------------ copias (versionAgregado)
    def _copia(self, sesion: Session, modelo: type, llave: str, valores: dict[str, Any]) -> None:
        tabla = modelo.__table__
        sesion.execute(
            insert(modelo)
            .values(valores)
            .on_conflict_do_update(index_elements=[llave], set_=valores, where=tabla.c.version < valores["version"])
        )

    def cliente(self, s: Session, d: Datos, _: datetime, __: str) -> None:
        self._copia(
            s,
            Cliente,
            "cliente_id",
            {
                "cliente_id": UUID(d["clienteId"]),
                "version": d["versionAgregado"],
                "razon_social": d["razonSocial"],
                "nit": d.get("nit"),
                "correo": d.get("correo"),
                "activo": d.get("activo", True),
            },
        )

    def ruta(self, s: Session, d: Datos, _: datetime, __: str) -> None:
        origen, destino = d.get("origen") or {}, d.get("destino") or {}
        self._copia(
            s,
            Ruta,
            "ruta_id",
            {
                "ruta_id": UUID(d["rutaId"]),
                "version": d["versionAgregado"],
                "nombre": d["nombre"],
                "origen_nombre": origen.get("nombre"),
                "destino_nombre": destino.get("nombre"),
                "origen_lat": (origen.get("coordenadas") or {}).get("lat"),
                "origen_lng": (origen.get("coordenadas") or {}).get("lng"),
                "destino_lat": (destino.get("coordenadas") or {}).get("lat"),
                "destino_lng": (destino.get("coordenadas") or {}).get("lng"),
                "distancia_km": Decimal(str(d["distanciaKm"])),
                "activa": d.get("activa", True),
            },
        )

    def chofer(self, s: Session, d: Datos, _: datetime, __: str) -> None:
        self._copia(
            s,
            Chofer,
            "chofer_id",
            {
                "chofer_id": UUID(d["choferId"]),
                "version": d["versionAgregado"],
                "nombre": d["nombre"],
                "usuario_sub": d.get("usuarioSub"),
                "activo": d.get("activo", True),
            },
        )

    # ------------------------------------------------------------------ viajes
    def _viaje(self, s: Session, viaje_id: str, ahora: datetime, **valores: Any) -> None:
        """Crea la fila parcial si el evento llega antes que ViajeConfirmado (paso 2) y aplica los valores."""
        valores = {k: v for k, v in valores.items() if v is not None}
        fila = {"viaje_id": UUID(viaje_id), "actualizado_en": ahora, **valores}
        s.execute(insert(HechoViaje).values(fila).on_conflict_do_update(index_elements=["viaje_id"], set_=fila))

    def _estado(self, s: Session, viaje_id: str, estado: str, ahora: datetime) -> None:
        """Un estado final no retrocede si llega un evento viejo fuera de orden."""
        s.execute(
            update(HechoViaje)
            .where(HechoViaje.viaje_id == UUID(viaje_id), HechoViaje.estado.not_in(ESTADOS_FINALES))
            .values(estado=estado)
        )

    def viaje_confirmado(self, s: Session, d: Datos, ocurrido: datetime, _: str) -> None:
        self._viaje(
            s,
            d["viajeId"],
            ocurrido,
            servicio_id=UUID(d["servicioId"]),
            cliente_id=UUID(d["clienteId"]),
            ruta_id=UUID(d["rutaId"]),
            tipo_carga=d["tipoCarga"],
            toneladas=Decimal(str(d["toneladas"])),
            fecha_viaje=date.fromisoformat(d["fechaViaje"]),
            monto=monto(d["monto"]),
            canal=d.get("canal"),
            placa=d["placa"],
            tracto_id=UUID(d["tractoId"]),
            remolque_id=UUID(d["remolqueId"]),
            chofer_id=UUID(d["choferId"]),
            chofer_nombre=d.get("choferNombre"),
            confirmado_en=ocurrido,
        )
        s.execute(
            update(HechoViaje)
            .where(HechoViaje.viaje_id == UUID(d["viajeId"]), HechoViaje.estado == "DESCONOCIDO")
            .values(estado="CONFIRMADO")
        )

    def viaje_iniciado(self, s: Session, d: Datos, ocurrido: datetime, _: str) -> None:
        posicion = d.get("posicion") or {}
        self._viaje(
            s,
            d["viajeId"],
            ocurrido,
            servicio_id=UUID(d["servicioId"]),
            chofer_id=UUID(d["choferId"]),
            tracto_id=UUID(d["tractoId"]),
            remolque_id=UUID(d["remolqueId"]),
            placa=d["placa"],
            iniciado_en=instante(d["iniciadoEn"]),
            ultima_lat=posicion.get("lat"),
            ultima_lng=posicion.get("lng"),
        )
        self._estado(s, d["viajeId"], "EN_RUTA", ocurrido)
        recalcular_riesgo(s, self.modelos, UUID(d["viajeId"]), self.reloj())

    def posicion(self, s: Session, d: Datos, ocurrido: datetime, _: str) -> None:
        viaje_id = UUID(d["viajeId"])
        en = instante(d["registradaEn"])
        p = d["posicion"]
        s.execute(
            insert(PosicionViaje)
            .values(viaje_id=viaje_id, registrada_en=en, lat=p["lat"], lng=p["lng"], velocidad_kmh=d["velocidadKmh"])
            .on_conflict_do_nothing()
        )
        s.execute(
            delete(PosicionViaje).where(
                PosicionViaje.viaje_id == viaje_id, PosicionViaje.registrada_en < en - RETENCION_POSICIONES
            )
        )
        # Solo avanza la última posición (los lotes pueden llegar desordenados).
        self._viaje(s, d["viajeId"], ocurrido, chofer_id=UUID(d["choferId"]))
        s.execute(
            update(HechoViaje)
            .where(
                HechoViaje.viaje_id == viaje_id,
                (HechoViaje.ultima_posicion_en.is_(None)) | (HechoViaje.ultima_posicion_en < en),
            )
            .values(ultima_lat=p["lat"], ultima_lng=p["lng"], ultima_velocidad=d["velocidadKmh"], ultima_posicion_en=en)
        )
        recalcular_riesgo(s, self.modelos, viaje_id, self.reloj())

    def hito(self, s: Session, d: Datos, ocurrido: datetime, _: str) -> None:
        viaje_id = UUID(d["viajeId"])
        nuevo = s.execute(
            insert(HitoViaje)
            .values(
                hito_id=UUID(d["hitoId"]), viaje_id=viaje_id, tipo=d["tipo"], registrado_en=instante(d["registradoEn"])
            )
            .on_conflict_do_nothing()
            .returning(HitoViaje.hito_id)
        ).scalar_one_or_none()
        self._viaje(s, d["viajeId"], ocurrido)
        if nuevo and d["tipo"] in ("BLOQUEO", "FALLA_MECANICA"):
            columna = HechoViaje.bloqueos if d["tipo"] == "BLOQUEO" else HechoViaje.fallas
            s.execute(update(HechoViaje).where(HechoViaje.viaje_id == viaje_id).values({columna: columna + 1}))
        recalcular_riesgo(s, self.modelos, viaje_id, self.reloj(), forzar=True)

    def conduccion(self, s: Session, d: Datos, _: datetime, __: str) -> None:
        s.execute(
            insert(HechoConduccion)
            .values(
                evento_id=UUID(d["eventoId"]),
                viaje_id=UUID(d["viajeId"]),
                chofer_id=UUID(d["choferId"]),
                tipo=d["tipo"],
                magnitud_g=d.get("magnitudG"),
                registrado_en=instante(d["registradoEn"]),
            )
            .on_conflict_do_nothing()
        )

    def _fin(self, s: Session, d: Datos, ocurrido: datetime, estado: str, en: str, motivo: str | None) -> None:
        self._viaje(
            s,
            d["viajeId"],
            ocurrido,
            servicio_id=UUID(d["servicioId"]),
            cliente_id=UUID(d["clienteId"]) if d.get("clienteId") else None,
            tracto_id=UUID(d["tractoId"]) if d.get("tractoId") else None,
            chofer_id=UUID(d["choferId"]) if d.get("choferId") else None,
            km_recorridos=Decimal(str(d["kmRecorridos"])) if d.get("kmRecorridos") is not None else None,
            terminado_en=instante(en),
            motivo_fin=motivo,
        )
        self._estado(s, d["viajeId"], estado, ocurrido)
        alertas.resolver(s, TipoAlerta.RIESGO_RETRASO, d["viajeId"], ocurrido)

    def entrega_confirmada(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        self._fin(s, d, ocurrido, "ENTREGADO", d["entregadoEn"], None)
        # Una entrega observada se cierra al aprobarla el despachador (spec 007).
        alertas.resolver(s, TipoAlerta.ENTREGA_OBSERVADA, d["viajeId"], ocurrido)

    def entrega_rechazada(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        self._fin(s, d, ocurrido, "ENTREGA_RECHAZADA", d["rechazadaEn"], d.get("motivo"))
        alertas.resolver(s, TipoAlerta.ENTREGA_OBSERVADA, d["viajeId"], ocurrido)
        quien = "el despachador" if d.get("origenRechazo") == "DESPACHADOR" else "el receptor"
        alertas.abrir(
            s,
            TipoAlerta.ENTREGA_RECHAZADA,
            d["viajeId"],
            f"Entrega rechazada{self._placa(s, d['viajeId'])}",
            f"La rechazó {quien}: {d.get('motivo', 'sin motivo')}. No se factura.",
            origen,
            ocurrido,
        )

    def entrega_observada(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        self._viaje(s, d["viajeId"], ocurrido, servicio_id=UUID(d["servicioId"]))
        self._estado(s, d["viajeId"], "ENTREGA_OBSERVADA", ocurrido)
        razones = ", ".join(r.replace("_", " ").lower() for r in d.get("razones", []))
        distancia = f" a {d['distanciaMetros']} m del destino" if d.get("distanciaMetros") is not None else ""
        alertas.abrir(
            s,
            TipoAlerta.ENTREGA_OBSERVADA,
            d["viajeId"],
            f"Entrega observada{self._placa(s, d['viajeId'])}",
            f"Revisar y aprobar o rechazar: {razones}{distancia}.",
            origen,
            ocurrido,
        )

    def viaje_cancelado(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        self._viaje(
            s,
            d["viajeId"],
            ocurrido,
            servicio_id=UUID(d["servicioId"]),
            cliente_id=UUID(d["clienteId"]),
            terminado_en=ocurrido,
            motivo_fin=d.get("motivo"),
        )
        self._estado(s, d["viajeId"], "CANCELADO", ocurrido)
        alertas.resolver(s, TipoAlerta.VIAJE_REQUIERE_INTERVENCION, d["viajeId"], ocurrido)
        alertas.resolver(s, TipoAlerta.RIESGO_RETRASO, d["viajeId"], ocurrido)

    def intervencion(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        self._viaje(s, d["viajeId"], ocurrido, servicio_id=UUID(d["servicioId"]))
        self._estado(s, d["viajeId"], "REQUIERE_INTERVENCION", ocurrido)
        error = d.get("error") or {}
        alertas.abrir(
            s,
            TipoAlerta.VIAJE_REQUIERE_INTERVENCION,
            d["viajeId"],
            f"Viaje requiere intervención{self._placa(s, d['viajeId'])}",
            f"La compensación {d['compensacionFallida']} falló {d['intentos']} veces "
            f"({error.get('codigo', 'ERROR')}): {error.get('mensaje', '')}".strip(),
            origen,
            ocurrido,
        )

    def _placa(self, s: Session, viaje_id: str) -> str:
        placa = s.scalar(select(HechoViaje.placa).where(HechoViaje.viaje_id == UUID(viaje_id)))
        return f" · {placa}" if placa else ""

    # ------------------------------------------------------------------ finanzas
    def factura(self, s: Session, d: Datos, _: datetime, __: str) -> None:
        fila = {
            "factura_id": UUID(d["facturaId"]),
            "numero": d["numero"],
            "viaje_id": UUID(d["viajeId"]),
            "servicio_id": UUID(d["servicioId"]),
            "cliente_id": UUID(d["clienteId"]),
            "razon_social": (d.get("cliente") or {}).get("razonSocial"),
            "monto": monto(d["monto"]),
            "emitida_el": date.fromisoformat(d["emitidaEl"]),
            "vence_el": date.fromisoformat(d["venceEl"]),
        }
        # Un pago que llegó antes dejó la fila parcial con su saldo: no se pisa.
        s.execute(
            insert(HechoFactura)
            .values({**fila, "saldo": fila["monto"], "estado": "EMITIDA"})
            .on_conflict_do_update(index_elements=["factura_id"], set_=fila)
        )

    def pago(self, s: Session, d: Datos, _: datetime, __: str) -> None:
        s.execute(
            insert(HechoPago)
            .values(
                pago_id=UUID(d["pagoId"]),
                factura_id=UUID(d["facturaId"]),
                cliente_id=UUID(d["clienteId"]),
                monto=monto(d["monto"]),
                fecha=date.fromisoformat(d["fecha"]),
                medio=d.get("medio"),
            )
            .on_conflict_do_nothing()
        )
        saldo = monto(d["saldoFactura"])
        s.execute(
            insert(HechoFactura)
            .values(
                factura_id=UUID(d["facturaId"]),
                numero=d["numeroFactura"],
                cliente_id=UUID(d["clienteId"]),
                monto=saldo,
                saldo=saldo,
                emitida_el=date.fromisoformat(d["fecha"]),
                vence_el=date.fromisoformat(d["fecha"]),
                estado=d["estadoFactura"],
            )
            .on_conflict_do_update(
                index_elements=["factura_id"],
                set_={"saldo": saldo, "estado": d["estadoFactura"]},
                # saldoFactura es el saldo después de este pago: el menor gana si llegan desordenados.
                where=HechoFactura.saldo > saldo,
            )
        )

    # ------------------------------------------------------------------ flota
    def carga(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        tracto = UUID(d["tractoId"])
        km = int(d["kilometraje"])
        anterior = s.scalar(
            select(HechoCombustible.kilometraje)
            .where(HechoCombustible.tracto_id == tracto, HechoCombustible.kilometraje < km)
            .order_by(HechoCombustible.kilometraje.desc())
            .limit(1)
        )
        rendimiento = km_por_litro(km, anterior, d["litros"])
        puntaje = self.modelos.anomalia(float(rendimiento), float(d["litros"])) if rendimiento is not None else None
        nueva = s.execute(
            insert(HechoCombustible)
            .values(
                carga_id=UUID(d["cargaId"]),
                tracto_id=tracto,
                placa=d["placa"],
                chofer_id=UUID(d["choferId"]),
                viaje_id=UUID(d["viajeId"]) if d.get("viajeId") else None,
                litros=Decimal(str(d["litros"])),
                monto=monto(d["monto"]),
                kilometraje=km,
                registrada_en=instante(d["registradaEn"]),
                km_por_litro=rendimiento,
                referencia="CON_REFERENCIA" if rendimiento is not None else "SIN_REFERENCIA",
                puntaje_anomalia=puntaje.puntaje if puntaje else None,
                es_anomalia=bool(puntaje and puntaje.es_anomalia),
            )
            .on_conflict_do_nothing()
            .returning(HechoCombustible.carga_id)
        ).scalar_one_or_none()
        if nueva and puntaje and puntaje.es_anomalia:
            alertas.abrir(
                s,
                TipoAlerta.ANOMALIA_COMBUSTIBLE,
                d["cargaId"],
                f"Carga de combustible anómala · {d['placa']}",
                f"{d['litros']} L con {km - (anterior or km)} km desde la carga anterior: {rendimiento} km/L.",
                origen,
                ocurrido,
            )

    def caida(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        s.execute(
            insert(CaidaCombustible)
            .values(
                deteccion_id=UUID(d["deteccionId"]),
                tracto_id=UUID(d["tractoId"]),
                placa=d["placa"],
                viaje_id=UUID(d["viajeId"]) if d.get("viajeId") else None,
                caida_pct=d["caidaPct"],
                nivel_anterior_pct=d["nivelAnteriorPct"],
                nivel_actual_pct=d["nivelActualPct"],
                detectada_en=instante(d["detectadaEn"]),
            )
            .on_conflict_do_nothing()
        )
        alertas.abrir(
            s,
            TipoAlerta.CAIDA_COMBUSTIBLE,
            d["tractoId"],
            f"Caída de combustible · {d['placa']}",
            f"El tanque bajó {d['caidaPct']} % ({d['nivelAnteriorPct']} % → {d['nivelActualPct']} %) "
            f"en {d['ventanaMinutos']} min a {d['velocidadKmh']} km/h.",
            origen,
            ocurrido,
        )

    def mantenimiento(self, s: Session, d: Datos, ocurrido: datetime, origen: str) -> None:
        evento_id = origen.split(":", 1)[1]
        s.execute(
            insert(HechoMantenimiento)
            .values(
                evento_id=UUID(evento_id),
                unidad_id=UUID(d["unidadId"]),
                tipo_unidad=d["tipoUnidad"],
                placa=d["placa"],
                motivos=d["motivos"],
                km_desde_ultimo=d.get("kmDesdeUltimo"),
                requerido_en=ocurrido,
            )
            .on_conflict_do_nothing()
        )
        motivos = ", ".join(m.replace("_", " ").lower() for m in d["motivos"])
        alertas.abrir(
            s,
            TipoAlerta.MANTENIMIENTO_REQUERIDO,
            d["unidadId"],
            f"Mantenimiento requerido · {d['placa']}",
            f"Motivo: {motivos}; {d.get('kmDesdeUltimo', '—')} km desde el último.",
            origen,
            ocurrido,
        )
