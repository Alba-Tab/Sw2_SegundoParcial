"""Acciones propuestas (spec 014, B): el agente propone, el despachador aprueba o rechaza, el sistema archiva."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.aplicacion import alertas
from app.configuracion import configuracion
from app.dominio import acciones as dominio
from app.dominio.acciones import EstadoAccion
from app.dominio.alertas import TipoAlerta
from app.dominio.errores import ErrorDeDominio
from app.infraestructura.bd import AccionPropuesta, Cliente, HechoViaje, Outbox, Ruta

CLAVE_AVISO = "analitica.aviso-cliente-aprobado.v1"


def accion_json(a: AccionPropuesta, razon_social: str | None = None) -> dict[str, Any]:
    return {
        "accionId": str(a.accion_id),
        "tipo": a.tipo,
        "viajeId": str(a.viaje_id),
        **({"servicioId": str(a.servicio_id)} if a.servicio_id else {}),
        "clienteId": str(a.cliente_id),
        **({"razonSocial": razon_social} if razon_social else {}),
        "mensaje": a.mensaje,
        "evidencia": a.evidencia,
        "estado": a.estado,
        **({"misionId": str(a.mision_id)} if a.mision_id else {}),
        "creadaEn": a.creada_en,
        **({"decididaPor": a.decidida_por, "decididaEn": a.decidida_en} if a.decidida_por else {}),
        **({"motivoRechazo": a.motivo_rechazo} if a.motivo_rechazo else {}),
    }


def proponer(
    s: Session, cuerpo: dict[str, Any], mision_id: UUID | None, ahora: datetime
) -> tuple[bool, dict[str, Any]]:
    """Una por (tipo, viaje) salvo ARCHIVADA: la repetida devuelve la existente sin crear nada."""
    if cuerpo["tipo"] not in dominio.TIPOS:
        raise ErrorDeDominio("VALIDACION", "Tipo de acción desconocido", "tipo")
    viaje_id = UUID(str(cuerpo["viajeId"]))
    existente = s.scalar(
        select(AccionPropuesta).where(
            AccionPropuesta.tipo == cuerpo["tipo"],
            AccionPropuesta.viaje_id == viaje_id,
            AccionPropuesta.estado != EstadoAccion.ARCHIVADA.value,
        )
    )
    if existente:
        return False, {"accionId": str(existente.accion_id), "estado": existente.estado, "creada": False}
    viaje = s.get(HechoViaje, viaje_id)
    if viaje is None:
        raise ErrorDeDominio("NO_ENCONTRADO", "Analítica no conoce ese viaje")
    # El destinatario es siempre el cliente del viaje; el LLM nunca escribe una dirección.
    if str(viaje.cliente_id) != str(cuerpo["destinatario"]["clienteId"]):
        raise ErrorDeDominio("DESTINATARIO_INVALIDO", "El destinatario debe ser el cliente del viaje")
    if mision_id:
        creadas = s.scalar(
            select(func.count()).select_from(AccionPropuesta).where(AccionPropuesta.mision_id == mision_id)
        )
        if (creadas or 0) >= dominio.MAX_POR_MISION:
            raise ErrorDeDominio(
                "LIMITE_ACCIONES", f"Una misión propone como máximo {dominio.MAX_POR_MISION} acciones (D86)"
            )
    accion = AccionPropuesta(
        accion_id=uuid.uuid4(),
        tipo=cuerpo["tipo"],
        viaje_id=viaje_id,
        servicio_id=viaje.servicio_id,
        cliente_id=viaje.cliente_id,
        mensaje=dominio.validar_mensaje(cuerpo["mensaje"], dominio.MENSAJE_AGENTE),
        evidencia=cuerpo["evidencia"],
        estado=EstadoAccion.PENDIENTE.value,
        mision_id=mision_id,
        creada_en=ahora,
    )
    s.add(accion)
    s.flush()
    cliente = s.get(Cliente, viaje.cliente_id)
    alerta_id = alertas.abrir(
        s,
        TipoAlerta.ACCION_PROPUESTA,
        str(accion.accion_id),
        f"El agente propone avisar a {cliente.razon_social if cliente else 'el cliente'}"
        + (f" · {viaje.placa}" if viaje.placa else ""),
        accion.mensaje[:300],
        f"mision:{mision_id}" if mision_id else "agente",
        ahora,
    )
    return True, {
        "accionId": str(accion.accion_id),
        "estado": accion.estado,
        "creada": True,
        "alertaId": str(alerta_id),
    }


def _accion(s: Session, accion_id: UUID) -> AccionPropuesta:
    accion = s.get(AccionPropuesta, accion_id, with_for_update=True)
    if accion is None:
        raise ErrorDeDominio("NO_ENCONTRADO", "La acción no existe")
    return accion


def _traceparent() -> str:
    return f"00-{secrets.token_hex(16)}-{secrets.token_hex(8)}-01"


def aprobar(
    s: Session, accion_id: UUID, mensaje: str, sub: str, roles: frozenset[str], correlacion: str | None, ahora: datetime
) -> AccionPropuesta:
    """PENDIENTE → APROBADA y `AvisoClienteAprobado` en el Outbox, en la misma transacción (paso 9)."""
    accion = _accion(s, accion_id)
    dominio.decidir(accion.estado, roles)
    texto = dominio.validar_mensaje(mensaje, dominio.MENSAJE_DESPACHADOR)
    cliente = s.get(Cliente, accion.cliente_id)
    if cliente is None or not cliente.correo:
        raise ErrorDeDominio("CLIENTE_SIN_CORREO", "Analítica no tiene el correo de ese cliente")
    viaje = s.get(HechoViaje, accion.viaje_id)
    ruta = s.get(Ruta, viaje.ruta_id) if viaje and viaje.ruta_id else None
    accion.estado = EstadoAccion.APROBADA.value
    accion.mensaje = texto
    accion.decidida_por = sub
    accion.decidida_en = ahora
    evento_id = uuid.uuid4()
    servicio = accion.servicio_id or accion.viaje_id
    sobre = {
        "id": str(evento_id),
        "tipo": "AvisoClienteAprobado",
        "version": 1,
        "ocurridoEn": ahora.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "correlationId": correlacion if _es_uuid(correlacion) else str(uuid.uuid4()),
        "traceparent": _traceparent(),
        "productor": "analitica",
        "datos": {
            "accionId": str(accion.accion_id),
            "clienteId": str(accion.cliente_id),
            "viajeId": str(accion.viaje_id),
            "destinatario": {"nombre": cliente.razon_social, "correo": cliente.correo},
            "asunto": dominio.asunto(ruta.destino_nombre if ruta else None),
            "mensaje": texto,
            "aprobadaPor": sub,
            "enlacePortal": f"{configuracion().portal_url.rstrip('/')}/servicios/{servicio}",
        },
    }
    s.add(Outbox(evento_id=evento_id, clave_enrutamiento=CLAVE_AVISO, sobre=sobre, creado_en=ahora))
    alertas.resolver(s, TipoAlerta.ACCION_PROPUESTA, str(accion.accion_id), ahora)
    return accion


def rechazar(
    s: Session, accion_id: UUID, motivo: str | None, sub: str, roles: frozenset[str], ahora: datetime
) -> AccionPropuesta:
    accion = _accion(s, accion_id)
    dominio.decidir(accion.estado, roles)
    if motivo and len(motivo) > dominio.MOTIVO_RECHAZO:
        raise ErrorDeDominio("VALIDACION", f"El motivo tiene hasta {dominio.MOTIVO_RECHAZO} caracteres", "motivo")
    accion.estado = EstadoAccion.RECHAZADA.value
    accion.motivo_rechazo = motivo
    accion.decidida_por = sub
    accion.decidida_en = ahora
    alertas.resolver(s, TipoAlerta.ACCION_PROPUESTA, str(accion.accion_id), ahora)
    return accion


def archivar(s: Session, ahora: datetime) -> int:
    """D87: PENDIENTE sin decisión en 24 h, o cuyo viaje terminó → ARCHIVADA."""
    limite = ahora - timedelta(hours=dominio.ARCHIVO_AUTOMATICO_HORAS)
    vencidas = s.scalars(
        select(AccionPropuesta)
        .outerjoin(HechoViaje, HechoViaje.viaje_id == AccionPropuesta.viaje_id)
        .where(
            AccionPropuesta.estado == EstadoAccion.PENDIENTE.value,
            (AccionPropuesta.creada_en < limite)
            | HechoViaje.estado.in_(("ENTREGADO", "ENTREGA_RECHAZADA", "CANCELADO", "CERRADO")),
        )
        .with_for_update(of=AccionPropuesta, skip_locked=True)
    ).all()
    for a in vencidas:
        a.estado = EstadoAccion.ARCHIVADA.value
        alertas.resolver(s, TipoAlerta.ACCION_PROPUESTA, str(a.accion_id), ahora)
    return len(vencidas)


def marcar_ejecutada(s: Session, sobre: dict[str, Any]) -> None:
    """El relay publicó el aviso con confirmación del broker: APROBADA → EJECUTADA."""
    if sobre.get("tipo") != "AvisoClienteAprobado":
        return
    accion = s.get(AccionPropuesta, UUID(sobre["datos"]["accionId"]))
    if accion and accion.estado == EstadoAccion.APROBADA.value:
        accion.estado = EstadoAccion.EJECUTADA.value


def listar(
    s: Session, estado: str | None, limite: int, antes: datetime | None
) -> list[tuple[AccionPropuesta, str | None]]:
    consulta = select(AccionPropuesta, Cliente.razon_social).outerjoin(
        Cliente, Cliente.cliente_id == AccionPropuesta.cliente_id
    )
    if estado:
        consulta = consulta.where(AccionPropuesta.estado == estado)
    if antes:
        consulta = consulta.where(AccionPropuesta.creada_en < antes)
    return [(a, r) for a, r in s.execute(consulta.order_by(AccionPropuesta.creada_en.desc()).limit(limite))]


def _es_uuid(valor: str | None) -> bool:
    try:
        return bool(valor) and uuid.UUID(valor) is not None  # type: ignore[arg-type]
    except ValueError:
        return False
