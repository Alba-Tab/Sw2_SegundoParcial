"""Consumidor de `analitica.eventos` (topología en plataforma/compose/rabbitmq).

Un mensaje que no es JSON, no cumple su contrato o no tiene manejador va a la DLQ (nack sin reencolar); un error de
negocio también. Una falla técnica (base caída) se reencola y la cola de quórum lo manda a la DLQ al pasar su límite
de entregas (`x-delivery-limit = 5`).
"""

import asyncio
import json
import logging

import aio_pika
from aio_pika.abc import AbstractIncomingMessage
from opentelemetry.trace import SpanKind
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolAgotado

from app.aplicacion.proyecciones import Proyecciones
from app.configuracion import configuracion
from app.infraestructura.bd import PREFETCH, transaccion
from app.infraestructura.eventos import valido
from app.infraestructura.observabilidad import con_correlacion, tramo

COLA = "analitica.eventos"
# Fallas técnicas de la base (caída, conexión rota o pool agotado): el mensaje se reencola.
FALLAS_TECNICAS = (OperationalError, InterfaceError, PoolAgotado)
log = logging.getLogger(__name__)


class ConsumidorEventos:
    def __init__(self, proyecciones: Proyecciones) -> None:
        self.proyecciones = proyecciones
        self.conexion: aio_pika.abc.AbstractRobustConnection | None = None
        self.conectado = False

    async def iniciar(self) -> None:
        while True:
            try:
                self.conexion = await aio_pika.connect_robust(configuracion().amqp_url)
                canal = await self.conexion.channel()
                await canal.set_qos(prefetch_count=PREFETCH)
                cola = await canal.get_queue(COLA, ensure=False)
                await cola.consume(self.recibir)
                self.conectado = True
                log.info("Escuchando %s", COLA)
                return
            except (aio_pika.exceptions.AMQPError, OSError) as e:
                log.warning("%s sin conexión, reintenta en 5 s: %s", COLA, e)
                await asyncio.sleep(5)

    async def detener(self) -> None:
        if self.conexion:
            await self.conexion.close()

    async def recibir(self, mensaje: AbstractIncomingMessage) -> None:
        try:
            sobre = json.loads(mensaje.body)
        except (ValueError, UnicodeDecodeError):
            sobre = None
        if not valido(sobre) or not self.proyecciones.conoce(sobre["tipo"]):
            log.warning("Evento inválido o sin manejador: va a la DLQ (%s)", (sobre or {}).get("tipo", "sin tipo"))
            await mensaje.nack(requeue=False)
            return
        try:
            nuevo = await asyncio.to_thread(self._procesar, sobre)
            await mensaje.ack()
            if not nuevo:
                log.info("%s %s ya procesado (Inbox)", sobre["tipo"], sobre["id"])
        except FALLAS_TECNICAS as e:
            log.warning("%s %s falló, se reencola: %s", sobre["tipo"], sobre["id"], e)
            await mensaje.nack(requeue=True)
        except Exception:
            log.exception("%s %s falló: va a la DLQ", sobre["tipo"], sobre["id"])
            await mensaje.nack(requeue=False)

    def _procesar(self, sobre: dict) -> bool:
        """Un span por evento que continúa el `traceparent` del sobre (D23: en Jaeger se ve evento → alerta)."""
        with (
            con_correlacion(sobre.get("correlationId")),
            tramo(
                f"consumir {sobre['tipo']}",
                padre=sobre.get("traceparent"),
                tipo=SpanKind.CONSUMER,
                evento=sobre["id"],
                productor=sobre.get("productor"),
            ),
            transaccion() as sesion,
        ):
            return self.proyecciones.procesar(sesion, sobre)
