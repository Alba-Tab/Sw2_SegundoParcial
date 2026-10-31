"""FC5: el consumidor y el relay vuelven solos después de reiniciar RabbitMQ (broker propio de Testcontainers).

`rabbitmqctl stop_app` cierra las conexiones como un reinicio (cierre forzado y puerto rehusado) sin cambiar el puerto
publicado del contenedor; `start_app` lo levanta otra vez. Nunca se usa el RabbitMQ del stack local.
"""

import asyncio
import json
import time
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import aio_pika
import pytest
from sqlalchemy import select
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

from app.aplicacion import acciones
from app.aplicacion.acciones import CLAVE_AVISO
from app.aplicacion.proyecciones import Proyecciones
from app.aplicacion.puertos import SinModelos
from app.infraestructura.bd import Cliente, Outbox, transaccion
from app.infraestructura.mensajeria import COLA, ConsumidorEventos
from app.infraestructura.relay import EXCHANGE, RelayOutbox
from tests.conftest import ejemplo
from tests.test_acciones import en_ruta, propuesta

USUARIO = "prueba"


@pytest.fixture(scope="module")
def broker() -> Iterator[DockerContainer]:
    contenedor = (
        DockerContainer("rabbitmq:4.4.0-management")
        .with_exposed_ports(5672)
        .with_env("RABBITMQ_DEFAULT_USER", USUARIO)
        .with_env("RABBITMQ_DEFAULT_PASS", USUARIO)
        .waiting_for(LogMessageWaitStrategy("Server startup complete").with_startup_timeout(120))
    )
    with contenedor:
        yield contenedor


def url(broker: DockerContainer) -> str:
    return f"amqp://{USUARIO}:{USUARIO}@{broker.get_container_host_ip()}:{broker.get_exposed_port(5672)}/"


async def esperar(condicion: Callable[[], bool], plazo: float = 60.0, que: str = "") -> None:
    fin = time.monotonic() + plazo
    while not await asyncio.to_thread(condicion):
        if time.monotonic() > fin:
            raise AssertionError(f"no se cumplió a tiempo: {que}")
        await asyncio.sleep(0.1)


async def reiniciar(broker: DockerContainer, mientras_cae: Callable[[], bool] | None = None) -> None:
    """Para la aplicación RabbitMQ, espera la caída y la vuelve a levantar."""
    resultado = await asyncio.to_thread(broker.exec, "rabbitmqctl stop_app")
    assert resultado.exit_code == 0, resultado.output
    if mientras_cae:
        await esperar(mientras_cae, que="ver la caída del broker")
    resultado = await asyncio.to_thread(broker.exec, "rabbitmqctl start_app")
    assert resultado.exit_code == 0, resultado.output


async def con_canal(broker: DockerContainer, hacer):  # type: ignore[no-untyped-def]
    conexion = await aio_pika.connect(url(broker), timeout=10)
    try:
        return await hacer(await conexion.channel())
    finally:
        await conexion.close()


def cliente_guardado(cliente_id: str) -> bool:
    with transaccion() as s:
        return s.get(Cliente, cliente_id) is not None


async def test_fc5_el_consumidor_vuelve_despues_de_reiniciar_rabbitmq(broker):
    async def declarar(canal):
        await canal.declare_queue(COLA, durable=True, arguments={"x-queue-type": "quorum", "x-delivery-limit": 5})

    async def publicar_y_contar(sobre):
        async def hacer(canal):
            await canal.default_exchange.publish(aio_pika.Message(json.dumps(sobre).encode()), routing_key=COLA)
            return (await canal.declare_queue(COLA, passive=True)).declaration_result.consumer_count

        return await con_canal(broker, hacer)

    await con_canal(broker, declarar)
    consumidor = ConsumidorEventos(Proyecciones(SinModelos()), url=url(broker), espera_inicial=0.2, espera_maxima=1)
    tarea = asyncio.create_task(consumidor.iniciar())
    try:
        await esperar(lambda: consumidor.conectado, que="primera conexión")
        antes = ejemplo("ClienteActualizado", clienteId=str(uuid4()))
        assert await publicar_y_contar(antes) == 1
        await esperar(lambda: cliente_guardado(antes["datos"]["clienteId"]), que="evento antes del reinicio")

        # Mientras el broker está caído, /health/ready lo ve: `conectado` pasa a False.
        await reiniciar(broker, mientras_cae=lambda: not consumidor.conectado)
        await esperar(lambda: consumidor.conectado, que="reconexión del consumidor")

        despues = ejemplo("ClienteActualizado", clienteId=str(uuid4()))
        assert await publicar_y_contar(despues) == 1, "la cola vuelve a tener su consumidor"
        await esperar(lambda: cliente_guardado(despues["datos"]["clienteId"]), que="evento después del reinicio")
    finally:
        await consumidor.detener()
        await asyncio.wait_for(tarea, 5)
    assert not consumidor.conectado


async def test_fc5_el_relay_publica_despues_de_reiniciar_rabbitmq(broker):
    async def declarar(canal):
        exchange = await canal.declare_exchange(EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        cola = await canal.declare_queue("n8n.prueba", durable=True)
        await cola.bind(exchange, CLAVE_AVISO)
        await cola.purge()

    async def mensajes_en_n8n():
        async def hacer(canal):
            return (await canal.declare_queue("n8n.prueba", passive=True)).declaration_result.message_count

        return await con_canal(broker, hacer)

    def aprobada() -> str:
        viaje = str(uuid4())
        en_ruta(viaje)
        ahora = datetime.now(UTC)
        with transaccion() as s:
            _, r = acciones.proponer(s, propuesta(viaje), None, ahora)
        with transaccion() as s:
            acciones.aprobar(s, r["accionId"], "Aviso del despachador", "d1", frozenset({"despachador"}), None, ahora)
            return str(s.scalars(select(Outbox.evento_id).where(Outbox.publicado_en.is_(None))).one())

    def publicado(evento_id: str) -> bool:
        with transaccion() as s:
            return s.get(Outbox, evento_id).publicado_en is not None

    await con_canal(broker, declarar)
    relay = RelayOutbox(intervalo=0.2, url=url(broker))
    tarea = asyncio.create_task(relay.correr())
    try:
        primero = aprobada()
        await esperar(lambda: publicado(primero), que="aviso antes del reinicio")
        await reiniciar(broker, mientras_cae=lambda: not relay.conectado)
        segundo = aprobada()
        await esperar(lambda: publicado(segundo), que="aviso después del reinicio")
        assert await mensajes_en_n8n() == 2 and relay.conectado
    finally:
        tarea.cancel()
        await asyncio.gather(tarea, return_exceptions=True)
        await relay.detener()


def test_health_ready_refleja_la_conexion_real(cliente, monkeypatch):
    from app import main

    consumiendo = main.configuracion().model_copy(update={"consumir_eventos": True})
    monkeypatch.setattr(main, "configuracion", lambda: consumiendo)
    cliente.app.state.consumidor = SimpleNamespace(conectado=False)
    caido = cliente.get("/health/ready")
    assert caido.status_code == 503 and caido.json()["dependencias"]["rabbitmq"] == "DOWN"
    cliente.app.state.consumidor = SimpleNamespace(conectado=True)
    assert cliente.get("/health/ready").json()["dependencias"]["rabbitmq"] == "UP"
