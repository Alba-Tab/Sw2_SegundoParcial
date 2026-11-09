"""Modelo de lectura y alertas (spec 013) con PostgreSQL real."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import TimeoutError as PoolAgotado

from app.aplicacion import alertas
from app.aplicacion.prediccion import recalcular_riesgo
from app.aplicacion.proyecciones import Proyecciones
from app.aplicacion.puertos import Prediccion, Puntaje, SinModelos
from app.dominio.alertas import TipoAlerta
from app.infraestructura import programador
from app.infraestructura.bd import Alerta, HechoCombustible, HechoFactura, HechoViaje, PrediccionRetraso, transaccion
from app.infraestructura.mensajeria import ConsumidorEventos
from app.infraestructura.observabilidad import correlacion, trace_id
from tests.conftest import ejemplo, token


def procesar(*sobres, modelos=None) -> list[bool]:
    p = Proyecciones(modelos or SinModelos())
    resultados = []
    for sobre in sobres:
        with transaccion() as s:
            resultados.append(p.procesar(s, sobre))
    return resultados


def alertas_de(tipo: str) -> list[Alerta]:
    with transaccion() as s:
        return list(s.scalars(select(Alerta).where(Alerta.tipo == tipo)))


def test_inbox_un_evento_repetido_no_crea_otra_alerta():
    rechazo = ejemplo("EntregaRechazada")
    assert procesar(rechazo, rechazo) == [True, False]
    assert len(alertas_de("ENTREGA_RECHAZADA")) == 1


def test_fs8_intervencion_critica_para_el_despachador_y_resuelta_al_cancelar(cliente):
    viaje = str(uuid4())
    procesar(ejemplo("ViajeConfirmado", viajeId=viaje), ejemplo("ViajeRequiereIntervencion", viajeId=viaje))
    despachador = cliente.get("/api/v1/alertas", headers=token("despachador")).json()
    assert [(a["tipo"], a["severidad"], a["enlace"]) for a in despachador["alertas"]] == [
        ("VIAJE_REQUIERE_INTERVENCION", "CRITICA", f"/cc-operaciones/viajes/{viaje}")
    ]
    assert despachador["abiertas"] == 1 and despachador["datosAl"]
    assert cliente.get("/api/v1/alertas", headers=token("jefe_flota")).json()["alertas"] == []
    procesar(ejemplo("ViajeCancelado", viajeId=viaje, origen="SISTEMA", motivo="COMPENSACION_AGOTADA"))
    (alerta,) = alertas_de("VIAJE_REQUIERE_INTERVENCION")
    assert alerta.estado == "RESUELTA"
    with transaccion() as s:
        assert s.get(HechoViaje, alerta.entidad_id).estado == "CANCELADO"


def test_fo5_observada_se_resuelve_al_aprobarla():
    viaje = str(uuid4())
    procesar(ejemplo("EntregaObservada", viajeId=viaje))
    assert alertas_de("ENTREGA_OBSERVADA")[0].estado == "ABIERTA"
    procesar(ejemplo("EntregaConfirmada", viajeId=viaje, aprobadaPor=str(uuid4())))
    assert alertas_de("ENTREGA_OBSERVADA")[0].estado == "RESUELTA"


def test_ff1_caida_de_combustible_con_placa_para_el_jefe_de_flota(cliente):
    procesar(ejemplo("CaidaCombustibleDetectada"))
    (a,) = cliente.get("/api/v1/alertas", headers=token("jefe_flota")).json()["alertas"]
    assert a["tipo"] == "CAIDA_COMBUSTIBLE" and "4521KTR" in a["titulo"] and "12.5 %" in a["detalle"]


def test_ff2_anomalia_solo_con_referencia():
    class Modelos(SinModelos):
        def anomalia(self, km_por_litro, litros):
            return Puntaje(es_anomalia=km_por_litro < 1, puntaje=0.7)

    tracto = str(uuid4())
    primera = ejemplo("CargaCombustibleRegistrada", tractoId=tracto, kilometraje=184320)
    rara = ejemplo("CargaCombustibleRegistrada", tractoId=tracto, cargaId=str(uuid4()), kilometraje=184440, litros=450)
    normal = ejemplo(
        "CargaCombustibleRegistrada", tractoId=tracto, cargaId=str(uuid4()), kilometraje=184890, litros=180
    )
    procesar(primera, rara, normal, modelos=Modelos())
    with transaccion() as s:
        cargas = {c.kilometraje: c for c in s.scalars(select(HechoCombustible))}
    assert cargas[184320].referencia == "SIN_REFERENCIA" and not cargas[184320].es_anomalia
    assert cargas[184440].es_anomalia and float(cargas[184440].km_por_litro) == 0.267
    assert not cargas[184890].es_anomalia
    assert [a.entidad_id for a in alertas_de("ANOMALIA_COMBUSTIBLE")] == [rara["datos"]["cargaId"]]


def test_pago_antes_que_la_factura_no_pisa_el_saldo():
    factura = ejemplo("FacturaEmitida")
    pago = ejemplo("PagoRegistrado", facturaId=factura["datos"]["facturaId"])
    procesar(pago, factura)
    with transaccion() as s:
        f = s.get(HechoFactura, factura["datos"]["facturaId"])
        assert (str(f.monto), str(f.saldo), f.estado, f.razon_social) == ("2800.00", "0.00", "PAGADA", "Agroexport SRL")


def test_evento_antes_que_viaje_confirmado_crea_fila_parcial():
    viaje = str(uuid4())
    procesar(ejemplo("PosicionActualizada", viajeId=viaje), ejemplo("ViajeConfirmado", viajeId=viaje))
    with transaccion() as s:
        v = s.get(HechoViaje, viaje)
        assert v.placa == "4521KTR" and v.ultima_lat == -17.6 and v.estado == "CONFIRMADO"


def test_atender_alerta_idempotente_y_gerente_sin_permiso(cliente):
    procesar(ejemplo("EntregaRechazada"))
    (a,) = cliente.get("/api/v1/alertas", headers=token("administracion")).json()["alertas"]
    url = f"/api/v1/alertas/{a['alertaId']}/atencion"
    clave = {"Idempotency-Key": str(uuid4())}
    gerente = cliente.post(url, json={}, headers={**token("gerente"), **clave})
    assert gerente.status_code == 403 and gerente.json()["codigo"] == "SIN_PERMISO"
    yo = token("despachador", sub="d1")
    primera = cliente.post(url, json={"nota": "Llamé al cliente"}, headers={**yo, **clave})
    segunda = cliente.post(url, json={"nota": "Llamé al cliente"}, headers={**yo, **clave})
    assert primera.status_code == segunda.status_code == 200
    assert primera.json() == segunda.json() and primera.json()["estado"] == "ATENDIDA"
    otra = cliente.post(url, json={"nota": "otra"}, headers={**yo, **clave})
    assert otra.status_code == 422 and otra.json()["codigo"] == "IDEMPOTENCIA_CUERPO_DISTINTO"
    conflicto = cliente.post(url, json={}, headers={**yo, "Idempotency-Key": str(uuid4())})
    assert conflicto.status_code == 409


def test_cursor_y_roles(cliente):
    for _ in range(3):
        procesar(ejemplo("MantenimientoRequerido", unidadId=str(uuid4())))
    pagina = cliente.get("/api/v1/alertas?limite=2", headers=token("jefe_flota")).json()
    assert len(pagina["alertas"]) == 2 and pagina["abiertas"] == 3
    resto = cliente.get(f"/api/v1/alertas?cursor={pagina['siguienteCursor']}", headers=token("jefe_flota")).json()
    assert len(resto["alertas"]) == 1
    nada = cliente.get(f"/api/v1/alertas?cursor={resto['siguienteCursor']}", headers=token("jefe_flota")).json()
    assert nada["alertas"] == [] and nada["siguienteCursor"] == resto["siguienteCursor"]
    assert cliente.get("/api/v1/alertas?cursor=xx", headers=token("jefe_flota")).status_code == 400
    assert cliente.get("/api/v1/alertas", headers=token("cliente")).status_code == 403
    assert cliente.get("/api/v1/alertas").status_code == 401
    assert cliente.get("/api/v1/alertas", headers=token("gerente", aud="viajes")).status_code == 401


def test_puntaje_de_conduccion_por_chofer(cliente):
    viaje, chofer = str(uuid4()), str(uuid4())
    procesar(
        ejemplo("EventoConduccionRegistrado", viajeId=viaje, choferId=chofer),
        ejemplo(
            "EventoConduccionRegistrado", viajeId=viaje, choferId=chofer, eventoId=str(uuid4()), tipo="ALERTA_FATIGA"
        ),
        ejemplo("EntregaConfirmada", viajeId=viaje, choferId=chofer, kmRecorridos=120),
        # Un viaje en curso todavía sin kmRecorridos no castiga al chofer con 0 (queda fuera del puntaje).
        ejemplo("EventoConduccionRegistrado", viajeId=str(uuid4()), choferId=chofer, eventoId=str(uuid4())),
    )
    r = cliente.get("/api/v1/conduccion?desde=2026-11-01", headers=token("jefe_flota")).json()
    assert r["choferes"][0]["frenadas"] == 1 and r["choferes"][0]["fatigas"] == 1 and r["choferes"][0]["puntaje"] == 75
    assert [v["viajeId"] for v in r["viajes"]] == [viaje]


class EnRiesgo(SinModelos):
    def __init__(self) -> None:
        self.trazas: list[str | None] = []

    def retraso(self, variables):
        self.trazas.append(trace_id())
        return Prediccion(0.83, [{"nombre": "Bloqueos en la bitácora", "aporte": 0.3}], "prueba-1")


def viaje_en_riesgo(modelos: SinModelos | None = None) -> str:
    viaje = str(uuid4())
    procesar(
        ejemplo("RutaActualizada"),
        ejemplo("ViajeConfirmado", viajeId=viaje),
        ejemplo("ViajeIniciado", viajeId=viaje),
        modelos=modelos or EnRiesgo(),
    )
    return viaje


def test_paso_7_una_sola_riesgo_retraso_aunque_se_haya_atendido(cliente):
    """Spec 013: una predicción nueva actualiza la alerta que ya existe, también si alguien la atendió."""
    viaje = viaje_en_riesgo()
    (a,) = cliente.get("/api/v1/alertas", headers=token("despachador")).json()["alertas"]
    atendida = cliente.post(
        f"/api/v1/alertas/{a['alertaId']}/atencion",
        json={"nota": "Llamé al chofer"},
        headers={**token("despachador"), "Idempotency-Key": str(uuid4())},
    )
    assert atendida.json()["estado"] == "ATENDIDA"
    for _ in range(3):
        with transaccion() as s:
            recalcular_riesgo(s, EnRiesgo(), viaje, datetime.now(UTC), forzar=True)
    (alerta,) = alertas_de("RIESGO_RETRASO")
    assert (alerta.estado, str(alerta.alerta_id)) == ("ATENDIDA", a["alertaId"])
    assert alerta.actualizada_en > datetime.fromisoformat(a["actualizadaEn"].replace("Z", "+00:00"))
    # Un tipo que no se resuelve solo sí abre otra después de atendida (es otra ocurrencia de la causa).
    caida = ejemplo("CaidaCombustibleDetectada")
    procesar(caida)
    with transaccion() as s:
        s.execute(update(Alerta).where(Alerta.tipo == "CAIDA_COMBUSTIBLE").values(estado="ATENDIDA"))
    procesar(ejemplo("CaidaCombustibleDetectada", deteccionId=str(uuid4())))
    assert sorted(x.estado for x in alertas_de("CAIDA_COMBUSTIBLE")) == ["ABIERTA", "ATENDIDA"]


def test_las_alertas_se_crean_de_a_una_para_que_el_cursor_no_pierda_ninguna():
    """La secuencia sigue el orden de confirmación: la segunda transacción espera a que confirme la primera."""
    ahora = datetime.now(UTC)
    with transaccion() as primera:
        alertas.abrir(primera, TipoAlerta.CAIDA_COMBUSTIBLE, str(uuid4()), "t", "d", "prueba", ahora)
        with pytest.raises(OperationalError), transaccion() as segunda:
            segunda.execute(text("SET LOCAL lock_timeout = '200ms'"))
            alertas.abrir(segunda, TipoAlerta.CAIDA_COMBUSTIBLE, str(uuid4()), "t", "d", "prueba", ahora)


def test_observada_no_se_resuelve_con_una_confirmacion_sin_aprobacion():
    viaje = str(uuid4())
    procesar(ejemplo("EntregaObservada", viajeId=viaje), ejemplo("EntregaConfirmada", viajeId=viaje))
    assert alertas_de("ENTREGA_OBSERVADA")[0].estado == "ABIERTA"


def test_el_job_y_los_hitos_respetan_un_calculo_por_minuto_d78():
    modelos = EnRiesgo()
    viaje = viaje_en_riesgo(modelos)
    hace = datetime.now(UTC) - timedelta(seconds=20)
    with transaccion() as s:
        s.execute(update(PrediccionRetraso).values(calculada_en=hace))
    procesar(ejemplo("HitoRegistrado", viajeId=viaje, tipo="BLOQUEO"), modelos=modelos)
    app = SimpleNamespace(state=SimpleNamespace(modelos=modelos))
    programador.recalcular_pendientes(app)
    with transaccion() as s:
        assert s.get(PrediccionRetraso, viaje).calculada_en == hace
        assert s.get(HechoViaje, viaje).bloqueos == 1
    # Pasado el minuto, el job lo alcanza: el hito quedó pendiente.
    with transaccion() as s:
        s.execute(update(PrediccionRetraso).values(calculada_en=hace - timedelta(minutes=1)))
    programador.recalcular_pendientes(app)
    with transaccion() as s:
        assert s.get(PrediccionRetraso, viaje).calculada_en > hace


def test_el_consumo_continua_la_traza_y_la_correlacion_del_evento():
    modelos = EnRiesgo()
    procesar(ejemplo("RutaActualizada"))
    viaje = str(uuid4())
    procesar(ejemplo("ViajeConfirmado", viajeId=viaje))
    iniciado = ejemplo("ViajeIniciado", viajeId=viaje)
    vistos = []

    class Proyeccion(Proyecciones):
        def procesar(self, sesion, sobre):
            vistos.append(correlacion())
            return super().procesar(sesion, sobre)

    ConsumidorEventos(Proyeccion(modelos))._procesar(iniciado)
    assert modelos.trazas == [iniciado["traceparent"].split("-")[1]]
    assert vistos == [iniciado["correlationId"]]


@pytest.mark.parametrize("falla", [PoolAgotado("pool"), OperationalError("x", {}, Exception("caída"))])
async def test_una_falla_tecnica_de_la_base_reencola(falla):
    consumidor = ConsumidorEventos(Proyecciones(SinModelos()))
    respuestas = []

    class Mensaje:
        body = __import__("json").dumps(ejemplo("ClienteActualizado")).encode()

        async def ack(self):
            respuestas.append("ack")

        async def nack(self, requeue):
            respuestas.append(("nack", requeue))

    def fallar(_sobre):
        raise falla

    consumidor._procesar = fallar
    await consumidor.recibir(Mensaje())
    assert respuestas == [("nack", True)]
