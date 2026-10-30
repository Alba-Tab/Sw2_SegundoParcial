"""Acciones propuestas, aprobación con Outbox y archivo automático (spec 014)."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.aplicacion import acciones
from app.infraestructura import eventos
from app.infraestructura.bd import AccionPropuesta, Alerta, Outbox, transaccion
from app.infraestructura.relay import confirmar, reclamar
from tests.conftest import ejemplo, token
from tests.test_alertas import procesar

CLIENTE = "01933b5a-1f00-7a20-8b11-0c2d3e4f5a01"


def propuesta(viaje: str, **cambios):
    return {
        "tipo": "AVISAR_CLIENTE_RETRASO",
        "viajeId": viaje,
        "destinatario": {"clienteId": CLIENTE},
        "mensaje": "Hay un bloqueo en Yapacaní según la bitácora; la entrega se retrasa.",
        "evidencia": [{"fuente": "buscar_bitacora", "referencia": "hito-1", "resumen": "BLOQUEO en Yapacaní"}],
    } | cambios


@pytest.fixture
def viaje():
    v = str(uuid4())
    procesar(ejemplo("ClienteActualizado"), ejemplo("RutaActualizada"), ejemplo("ViajeConfirmado", viajeId=v))
    return v


def post(cliente, url, cuerpo, *roles, sub="s", clave=None, **cabeceras):
    return cliente.post(
        url, json=cuerpo, headers={**token(*roles, sub=sub), "Idempotency-Key": clave or str(uuid4()), **cabeceras}
    )


def test_fm3_proponer_aprobar_y_publicar_una_vez(cliente, viaje):
    agente = post(cliente, "/api/v1/acciones", propuesta(viaje), "agente_lectura", sub="agente")
    assert agente.status_code == 201 and agente.json()["creada"] and agente.json()["alertaId"]
    otra = post(cliente, "/api/v1/acciones", propuesta(viaje), "agente_lectura", sub="agente")
    assert otra.status_code == 200 and otra.json() == {
        "accionId": agente.json()["accionId"],
        "estado": "PENDIENTE",
        "creada": False,
    }
    accion = agente.json()["accionId"]
    url = f"/api/v1/acciones/{accion}/aprobacion"
    assert post(cliente, url, {"mensaje": "Aviso editado por el despachador"}, "gerente").status_code == 403
    ok = post(cliente, url, {"mensaje": "Aviso editado por el despachador"}, "despachador", sub="d1")
    assert ok.status_code == 200 and ok.json()["estado"] == "APROBADA"
    assert post(cliente, url, {"mensaje": "Otra vez aprobada"}, "despachador").status_code == 409
    with transaccion() as s:
        (fila,) = s.scalars(select(Outbox)).all()
        assert s.scalar(select(Alerta.estado).where(Alerta.entidad_id == accion)) == "RESUELTA"
    assert eventos.valido(fila.sobre), "el aviso cumple su contrato"
    datos = fila.sobre["datos"]
    assert datos["destinatario"] == {"nombre": "Agroexport SRL", "correo": "cobranzas@agroexport.example"}
    assert datos["asunto"] == "Su viaje a Lugar de la defensa llegará con retraso" and datos["aprobadaPor"] == "d1"
    # El relay publica y marca EJECUTADA; otra vuelta no reclama nada.
    (pendiente,) = reclamar(datetime.now(UTC))
    confirmar(pendiente[0], pendiente[2])
    assert reclamar(datetime.now(UTC) + timedelta(minutes=5)) == []
    assert cliente.get(f"/api/v1/acciones/{accion}", headers=token("gerente")).json()["estado"] == "EJECUTADA"
    # Una misión siguiente no la vuelve a proponer.
    assert post(cliente, "/api/v1/acciones", propuesta(viaje), "agente_lectura").json()["estado"] == "EJECUTADA"


def test_rechazo_y_reglas(cliente, viaje):
    assert post(cliente, "/api/v1/acciones", propuesta(viaje), "despachador").status_code == 403
    ajeno = post(
        cliente, "/api/v1/acciones", propuesta(viaje, destinatario={"clienteId": str(uuid4())}), "agente_lectura"
    )
    assert ajeno.status_code == 422 and ajeno.json()["codigo"] == "DESTINATARIO_INVALIDO"
    assert post(cliente, "/api/v1/acciones", propuesta(str(uuid4())), "agente_lectura").status_code == 404
    corto = post(cliente, "/api/v1/acciones", propuesta(viaje, mensaje="corto"), "agente_lectura")
    assert corto.status_code == 400
    accion = post(cliente, "/api/v1/acciones", propuesta(viaje), "agente_lectura").json()["accionId"]
    r = post(cliente, f"/api/v1/acciones/{accion}/rechazo", {"motivo": "Ya avisé por teléfono"}, "despachador")
    assert r.json()["estado"] == "RECHAZADA"
    assert post(cliente, "/api/v1/acciones", propuesta(viaje), "agente_lectura").json()["estado"] == "RECHAZADA"
    lista = cliente.get("/api/v1/acciones?estado=RECHAZADA", headers=token("despachador")).json()["acciones"]
    assert [a["accionId"] for a in lista] == [accion] and lista[0]["razonSocial"] == "Agroexport SRL"


def test_limite_de_tres_por_mision(cliente):
    mision = str(uuid4())
    viajes = [str(uuid4()) for _ in range(4)]
    procesar(ejemplo("ClienteActualizado"), *(ejemplo("ViajeConfirmado", viajeId=v) for v in viajes))
    codigos = [
        post(cliente, "/api/v1/acciones", propuesta(v), "agente_lectura", **{"X-Mision-Id": mision}).status_code
        for v in viajes
    ]
    assert codigos == [201, 201, 201, 422]


def test_archivo_automatico_d87(viaje):
    with transaccion() as s:
        _, r = acciones.proponer(s, propuesta(viaje), None, datetime.now(UTC) - timedelta(hours=25))
    with transaccion() as s:
        assert acciones.archivar(s, datetime.now(UTC)) == 1
        assert s.get(AccionPropuesta, r["accionId"]).estado == "ARCHIVADA"
    # Archivada, el agente puede volver a proponer para ese viaje.
    with transaccion() as s:
        assert acciones.proponer(s, propuesta(viaje), None, datetime.now(UTC))[0]
