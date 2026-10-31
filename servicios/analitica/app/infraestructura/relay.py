"""Relay del Outbox (Python): publica con confirmación del broker y recién entonces marca publicado (spec 014, paso 10).

Reclama un lote con `FOR UPDATE SKIP LOCKED` y un plazo de reclamo, así dos réplicas no publican lo mismo a la vez
(igual se publica "al menos una vez": n8n deduplica por `eventId`).

Conexión simple, sin `connect_robust` (FC5): si el broker la cierra, o una publicación falla o no se confirma a tiempo,
se suelta y la vuelta siguiente abre otra. Lo reclamado y no confirmado se reintenta al vencer el reclamo.
"""

import asyncio
import contextlib
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import aio_pika
from aio_pika.abc import AbstractConnection
from sqlalchemy import select

from app.aplicacion.acciones import marcar_ejecutada
from app.configuracion import configuracion
from app.infraestructura.bd import Outbox, transaccion

EXCHANGE = "transporte.events"
LOTE = 20
RECLAMO = timedelta(seconds=30)
# Para conectar y para que el broker confirme cada publicación; vencido, la conexión se descarta.
PLAZO_S = 10.0
# Broker caído o a medio levantar: conexión rehusada, cierre forzado, canal cerrado, plazo vencido.
FALLAS_BROKER = (aio_pika.exceptions.AMQPError, OSError, RuntimeError)
log = logging.getLogger(__name__)


def reclamar(ahora: datetime) -> list[tuple[str, str, dict]]:
    with transaccion() as s:
        filas = s.scalars(
            select(Outbox)
            .where(Outbox.publicado_en.is_(None), (Outbox.reclamado_hasta.is_(None)) | (Outbox.reclamado_hasta < ahora))
            .order_by(Outbox.creado_en)
            .limit(LOTE)
            .with_for_update(skip_locked=True)
        ).all()
        for f in filas:
            f.reclamado_hasta = ahora + RECLAMO
        return [(str(f.evento_id), f.clave_enrutamiento, f.sobre) for f in filas]


def confirmar(evento_id: str, sobre: dict) -> None:
    with transaccion() as s:
        fila = s.get(Outbox, evento_id)
        if fila and fila.publicado_en is None:
            fila.publicado_en = datetime.now(UTC)
            marcar_ejecutada(s, sobre)


class RelayOutbox:
    def __init__(self, intervalo: float = 2.0, url: str | None = None) -> None:
        self.intervalo = intervalo
        self.url = url
        self.conexion: AbstractConnection | None = None
        self._caida = False

    @property
    def conectado(self) -> bool:
        return self.conexion is not None and not self._caida and not self.conexion.is_closed

    async def correr(self) -> None:
        while True:
            try:
                await self.vuelta()
            except FALLAS_BROKER as e:
                log.warning("Outbox: se reintenta en la siguiente vuelta (%r)", e)
                await self._soltar()
            except Exception:
                log.exception("Outbox: error inesperado")
            await asyncio.sleep(self.intervalo)

    async def _conectar(self) -> AbstractConnection:
        conexion = await aio_pika.connect(self.url or configuracion().amqp_url, timeout=PLAZO_S)
        conexion.close_callbacks.add(self._al_cerrarse)
        return conexion

    def _al_cerrarse(self, conexion: Any, *_: Any) -> None:
        """El broker cerró la conexión (reinicio, cierre forzado): la vuelta siguiente la suelta y abre otra."""
        if self.conexion is conexion:
            self._caida = True

    async def _soltar(self) -> None:
        conexion, self.conexion, self._caida = self.conexion, None, False
        if conexion is not None:
            with contextlib.suppress(Exception):
                await conexion.close()

    async def vuelta(self) -> int:
        pendientes = await asyncio.to_thread(reclamar, datetime.now(UTC))
        if not pendientes:
            return 0
        if not self.conectado:
            await self._soltar()
            self.conexion = await self._conectar()
        # on_return_raises: un mensaje `mandatory` que ninguna cola recibe falla en vez de darse por publicado.
        canal = await self.conexion.channel(publisher_confirms=True, on_return_raises=True)
        publicados = 0
        try:
            exchange = await canal.get_exchange(EXCHANGE, ensure=False)
            for evento_id, clave, sobre in pendientes:
                mensaje = aio_pika.Message(
                    json.dumps(sobre).encode(),
                    content_type="application/json",
                    content_encoding="utf-8",
                    message_id=evento_id,
                    correlation_id=sobre.get("correlationId"),
                    headers={"traceparent": sobre["traceparent"]} if sobre.get("traceparent") else None,
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                )
                try:
                    # Espera la confirmación del broker.
                    await exchange.publish(mensaje, routing_key=clave, mandatory=True, timeout=PLAZO_S)
                except aio_pika.exceptions.DeliveryError as e:
                    # Sin ruta (o rechazado): queda pendiente y la acción sigue APROBADA; se reintenta al vencer el
                    # reclamo.
                    log.warning("Outbox: %s (%s) no se entregó, queda pendiente: %s", evento_id, clave, e)
                    continue
                await asyncio.to_thread(confirmar, evento_id, sobre)
                publicados += 1
        finally:
            if not canal.is_closed:
                with contextlib.suppress(*FALLAS_BROKER):
                    await canal.close()
        log.info("Outbox: %s de %s eventos publicados", publicados, len(pendientes))
        return publicados

    async def detener(self) -> None:
        await self._soltar()
