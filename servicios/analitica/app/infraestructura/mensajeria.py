"""Consumidor de `analitica.eventos` (topología en plataforma/compose/rabbitmq).

Un mensaje que no es JSON, no cumple su contrato o no tiene manejador va a la DLQ (nack sin reencolar); un error de
negocio también. Una falla técnica (base caída) se reencola y la cola de quórum lo manda a la DLQ al pasar su límite
de entregas (`x-delivery-limit = 5`).

Reconexión propia (FC5): con `connect_robust` la cola quedaba sin consumidor después de reiniciar RabbitMQ y
`/health/ready` seguía en UP. Aquí cada vuelta conecta, abre el canal con su `prefetch`, consume y espera a que se
cierre la conexión o el canal; entonces suelta todo y vuelve a conectar con una espera creciente.
"""

import asyncio
import contextlib
import json
import logging
from typing import Any

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractIncomingMessage
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
# Lo que lanza el broker caído o a medio levantar: conexión rehusada, cierre forzado, canal cerrado, plazo vencido.
FALLAS_BROKER = (aio_pika.exceptions.AMQPError, OSError, RuntimeError)
PLAZO_CONEXION_S = 10.0
log = logging.getLogger(__name__)


class ConsumidorEventos:
    def __init__(
        self,
        proyecciones: Proyecciones,
        url: str | None = None,
        espera_inicial: float = 1.0,
        espera_maxima: float = 30.0,
    ) -> None:
        self.proyecciones = proyecciones
        self.url = url
        self.espera_inicial = espera_inicial
        self.espera_maxima = espera_maxima
        self.conexion: AbstractConnection | None = None
        self._canal: AbstractChannel | None = None
        self._cerrada: asyncio.Event | None = None
        self._detenido = False

    @property
    def conectado(self) -> bool:
        """Lo que lee `/health/ready`: conexión y canal abiertos con el consumidor registrado."""
        return (
            self._canal is not None
            and not self._canal.is_closed
            and self._cerrada is not None
            and not self._cerrada.is_set()
        )

    async def iniciar(self) -> None:
        """Nunca termina sola: cada caída del broker (o del canal) vuelve a conectar con espera creciente."""
        espera = self.espera_inicial
        while not self._detenido:
            estuvo_conectado = False
            try:
                estuvo_conectado = await self._consumir()
                if not self._detenido:
                    log.warning("%s: se cerró la conexión con RabbitMQ, se reconecta", COLA)
            except FALLAS_BROKER as e:
                log.warning("%s sin conexión, reintenta en %.0f s: %r", COLA, espera, e)
            except Exception:
                log.exception("%s: error inesperado del consumidor, reintenta en %.0f s", COLA, espera)
            finally:
                await self._soltar()
            if self._detenido:
                return
            if estuvo_conectado:
                espera = self.espera_inicial
            await asyncio.sleep(espera)
            espera = min(espera * 2, self.espera_maxima)

    async def _consumir(self) -> bool:
        """Conecta y consume hasta que se cierre la conexión o el canal. Devuelve True si llegó a consumir."""
        cerrada = asyncio.Event()
        self._cerrada = cerrada

        def avisar(*_: Any) -> None:
            cerrada.set()

        self.conexion = await aio_pika.connect(self.url or configuracion().amqp_url, timeout=PLAZO_CONEXION_S)
        self.conexion.close_callbacks.add(avisar)
        canal = await self.conexion.channel()
        canal.close_callbacks.add(avisar)
        await canal.set_qos(prefetch_count=PREFETCH)
        cola = await canal.get_queue(COLA, ensure=False)
        await cola.consume(self.recibir)
        self._canal = canal
        log.info("Escuchando %s", COLA)
        await cerrada.wait()
        return True

    async def _soltar(self) -> None:
        self._canal = None
        if self._cerrada is not None:
            self._cerrada.set()
        conexion, self.conexion = self.conexion, None
        if conexion is not None:
            with contextlib.suppress(Exception):
                await conexion.close()

    async def detener(self) -> None:
        self._detenido = True
        await self._soltar()

    async def recibir(self, mensaje: AbstractIncomingMessage) -> None:
        try:
            sobre = json.loads(mensaje.body)
        except (ValueError, UnicodeDecodeError):
            sobre = None
        if not valido(sobre) or not self.proyecciones.conoce(sobre["tipo"]):
            log.warning("Evento inválido o sin manejador: va a la DLQ (%s)", (sobre or {}).get("tipo", "sin tipo"))
            await _responder(mensaje.nack(requeue=False))
            return
        try:
            nuevo = await asyncio.to_thread(self._procesar, sobre)
        except FALLAS_TECNICAS as e:
            log.warning("%s %s falló, se reencola: %s", sobre["tipo"], sobre["id"], e)
            await _responder(mensaje.nack(requeue=True))
            return
        except Exception:
            log.exception("%s %s falló: va a la DLQ", sobre["tipo"], sobre["id"])
            await _responder(mensaje.nack(requeue=False))
            return
        await _responder(mensaje.ack())
        if not nuevo:
            log.info("%s %s ya procesado (Inbox)", sobre["tipo"], sobre["id"])

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


async def _responder(respuesta: Any) -> None:
    """ack/nack con el canal ya cerrado: el broker reentrega el mensaje al reconectar y el Inbox lo deduplica."""
    try:
        await respuesta
    except FALLAS_BROKER as e:
        log.warning("%s: no se pudo confirmar el mensaje (se reentrega al reconectar): %r", COLA, e)
