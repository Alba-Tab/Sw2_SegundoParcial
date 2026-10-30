"""Tablas del modelo de lectura y de las alertas (Alembic las crea; este módulo solo las describe)."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Identity,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    create_engine,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.configuracion import configuracion


class Base(DeclarativeBase):
    pass


Instante = DateTime(timezone=True)
Dinero = Numeric(14, 2)


class InboxEvento(Base):
    __tablename__ = "inbox_eventos"
    evento_id: Mapped[UUID] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(60))
    ocurrido_en: Mapped[datetime] = mapped_column(Instante)
    procesado_en: Mapped[datetime] = mapped_column(Instante)


class EstadoLectura(Base):
    """Una fila: `datos_al` es el mayor `ocurridoEn` procesado (propuesta 4.2)."""

    __tablename__ = "estado_lectura"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    datos_al: Mapped[datetime | None] = mapped_column(Instante)


class Cliente(Base):
    __tablename__ = "cliente"
    cliente_id: Mapped[UUID] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer)
    razon_social: Mapped[str] = mapped_column(String(200))
    nit: Mapped[str | None] = mapped_column(String(20))
    correo: Mapped[str | None] = mapped_column(String(200))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Ruta(Base):
    __tablename__ = "ruta"
    ruta_id: Mapped[UUID] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer)
    nombre: Mapped[str] = mapped_column(String(120))
    origen_nombre: Mapped[str | None] = mapped_column(String(120))
    destino_nombre: Mapped[str | None] = mapped_column(String(120))
    origen_lat: Mapped[float | None]
    origen_lng: Mapped[float | None]
    destino_lat: Mapped[float | None]
    destino_lng: Mapped[float | None]
    distancia_km: Mapped[Decimal] = mapped_column(Numeric(8, 1))
    activa: Mapped[bool] = mapped_column(Boolean, default=True)


class Chofer(Base):
    __tablename__ = "chofer"
    chofer_id: Mapped[UUID] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer)
    nombre: Mapped[str] = mapped_column(String(160))
    usuario_sub: Mapped[str | None] = mapped_column(String(64))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class HechoViaje(Base):
    """Una fila por viaje; un evento que llega antes que ViajeConfirmado la crea parcial (spec 013, paso 2)."""

    __tablename__ = "hecho_viaje"
    viaje_id: Mapped[UUID] = mapped_column(primary_key=True)
    servicio_id: Mapped[UUID | None]
    cliente_id: Mapped[UUID | None]
    ruta_id: Mapped[UUID | None]
    tipo_carga: Mapped[str | None] = mapped_column(String(30))
    toneladas: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    fecha_viaje: Mapped[date | None] = mapped_column(Date)
    monto: Mapped[Decimal | None] = mapped_column(Dinero)
    canal: Mapped[str | None] = mapped_column(String(20))
    placa: Mapped[str | None] = mapped_column(String(10))
    tracto_id: Mapped[UUID | None]
    remolque_id: Mapped[UUID | None]
    chofer_id: Mapped[UUID | None]
    chofer_nombre: Mapped[str | None] = mapped_column(String(160))
    estado: Mapped[str] = mapped_column(String(30), default="DESCONOCIDO")
    confirmado_en: Mapped[datetime | None] = mapped_column(Instante)
    iniciado_en: Mapped[datetime | None] = mapped_column(Instante)
    terminado_en: Mapped[datetime | None] = mapped_column(Instante)
    ultima_lat: Mapped[float | None]
    ultima_lng: Mapped[float | None]
    ultima_velocidad: Mapped[float | None]
    ultima_posicion_en: Mapped[datetime | None] = mapped_column(Instante)
    bloqueos: Mapped[int] = mapped_column(Integer, default=0)
    fallas: Mapped[int] = mapped_column(Integer, default=0)
    km_recorridos: Mapped[Decimal | None] = mapped_column(Numeric(8, 1))
    motivo_fin: Mapped[str | None] = mapped_column(Text)
    actualizado_en: Mapped[datetime | None] = mapped_column(Instante)


class PosicionViaje(Base):
    """Últimas posiciones del viaje: para los minutos detenido en la última hora (D79)."""

    __tablename__ = "posicion_viaje"
    viaje_id: Mapped[UUID] = mapped_column(primary_key=True)
    registrada_en: Mapped[datetime] = mapped_column(Instante, primary_key=True)
    lat: Mapped[float]
    lng: Mapped[float]
    velocidad_kmh: Mapped[float]


class HitoViaje(Base):
    __tablename__ = "hito_viaje"
    hito_id: Mapped[UUID] = mapped_column(primary_key=True)
    viaje_id: Mapped[UUID]
    tipo: Mapped[str] = mapped_column(String(30))
    registrado_en: Mapped[datetime] = mapped_column(Instante)


class HechoFactura(Base):
    __tablename__ = "hecho_factura"
    factura_id: Mapped[UUID] = mapped_column(primary_key=True)
    numero: Mapped[str] = mapped_column(String(30))
    viaje_id: Mapped[UUID | None]
    servicio_id: Mapped[UUID | None]
    cliente_id: Mapped[UUID]
    razon_social: Mapped[str | None] = mapped_column(String(200))
    monto: Mapped[Decimal] = mapped_column(Dinero)
    saldo: Mapped[Decimal] = mapped_column(Dinero)
    emitida_el: Mapped[date] = mapped_column(Date)
    vence_el: Mapped[date] = mapped_column(Date)
    estado: Mapped[str] = mapped_column(String(20), default="EMITIDA")


class HechoPago(Base):
    __tablename__ = "hecho_pago"
    pago_id: Mapped[UUID] = mapped_column(primary_key=True)
    factura_id: Mapped[UUID]
    cliente_id: Mapped[UUID]
    monto: Mapped[Decimal] = mapped_column(Dinero)
    fecha: Mapped[date] = mapped_column(Date)
    medio: Mapped[str | None] = mapped_column(String(30))


class HechoCombustible(Base):
    __tablename__ = "hecho_combustible"
    carga_id: Mapped[UUID] = mapped_column(primary_key=True)
    tracto_id: Mapped[UUID]
    placa: Mapped[str] = mapped_column(String(10))
    chofer_id: Mapped[UUID | None]
    viaje_id: Mapped[UUID | None]
    litros: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    monto: Mapped[Decimal] = mapped_column(Dinero)
    kilometraje: Mapped[int] = mapped_column(Integer)
    registrada_en: Mapped[datetime] = mapped_column(Instante)
    km_por_litro: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    referencia: Mapped[str] = mapped_column(String(20), default="SIN_REFERENCIA")
    puntaje_anomalia: Mapped[float | None]
    es_anomalia: Mapped[bool] = mapped_column(Boolean, default=False)


class CaidaCombustible(Base):
    __tablename__ = "caida_combustible"
    deteccion_id: Mapped[UUID] = mapped_column(primary_key=True)
    tracto_id: Mapped[UUID]
    placa: Mapped[str] = mapped_column(String(10))
    viaje_id: Mapped[UUID | None]
    caida_pct: Mapped[float]
    nivel_anterior_pct: Mapped[float]
    nivel_actual_pct: Mapped[float]
    detectada_en: Mapped[datetime] = mapped_column(Instante)


class HechoConduccion(Base):
    __tablename__ = "hecho_conduccion"
    evento_id: Mapped[UUID] = mapped_column(primary_key=True)
    viaje_id: Mapped[UUID]
    chofer_id: Mapped[UUID]
    tipo: Mapped[str] = mapped_column(String(20))
    magnitud_g: Mapped[float | None]
    registrado_en: Mapped[datetime] = mapped_column(Instante)


class HechoMantenimiento(Base):
    __tablename__ = "hecho_mantenimiento"
    evento_id: Mapped[UUID] = mapped_column(primary_key=True)
    unidad_id: Mapped[UUID]
    tipo_unidad: Mapped[str] = mapped_column(String(20))
    placa: Mapped[str] = mapped_column(String(10))
    motivos: Mapped[list[str]] = mapped_column(ARRAY(String(30)))
    km_desde_ultimo: Mapped[int | None] = mapped_column(Integer)
    requerido_en: Mapped[datetime] = mapped_column(Instante)


class PrediccionRetraso(Base):
    __tablename__ = "prediccion_retraso"
    viaje_id: Mapped[UUID] = mapped_column(primary_key=True)
    probabilidad: Mapped[float]
    calculada_en: Mapped[datetime] = mapped_column(Instante)
    modelo_version: Mapped[str] = mapped_column(String(40))
    factores: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)


class Alerta(Base):
    __tablename__ = "alerta"
    alerta_id: Mapped[UUID] = mapped_column(primary_key=True)
    secuencia: Mapped[int] = mapped_column(BigInteger, Identity(always=True), unique=True)
    tipo: Mapped[str] = mapped_column(String(40))
    severidad: Mapped[str] = mapped_column(String(10))
    roles: Mapped[list[str]] = mapped_column(ARRAY(String(30)))
    titulo: Mapped[str] = mapped_column(String(200))
    detalle: Mapped[str] = mapped_column(Text)
    entidad_tipo: Mapped[str] = mapped_column(String(10))
    entidad_id: Mapped[str] = mapped_column(String(64))
    enlace: Mapped[str] = mapped_column(String(200))
    estado: Mapped[str] = mapped_column(String(10))
    origen: Mapped[str] = mapped_column(String(80))
    creada_en: Mapped[datetime] = mapped_column(Instante)
    actualizada_en: Mapped[datetime] = mapped_column(Instante)
    atendida_por: Mapped[str | None] = mapped_column(String(64))
    nota: Mapped[str | None] = mapped_column(String(300))


class OperacionIdempotente(Base):
    """Autoridad de Idempotency-Key (000 §4.1): misma transacción que el cambio."""

    __tablename__ = "operacion_idempotente"
    clave: Mapped[UUID] = mapped_column(primary_key=True)
    operacion: Mapped[str] = mapped_column(String(60))
    sub: Mapped[str] = mapped_column(String(64))
    hash_cuerpo: Mapped[str] = mapped_column(String(64))
    status: Mapped[int] = mapped_column(Integer)
    respuesta: Mapped[dict[str, Any]] = mapped_column(JSONB)
    creada_en: Mapped[datetime] = mapped_column(Instante)


class Auditoria(Base):
    """000 §9: quién hizo qué (atender, aprobar, exportar, preguntar)."""

    __tablename__ = "auditoria"
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    ocurrido_en: Mapped[datetime] = mapped_column(Instante)
    actor_sub: Mapped[str] = mapped_column(String(64))
    actor_rol: Mapped[str | None] = mapped_column(String(30))
    accion: Mapped[str] = mapped_column(String(60))
    entidad_id: Mapped[str | None] = mapped_column(String(64))
    correlation_id: Mapped[str | None] = mapped_column(String(64))
    datos: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Exportacion(Base):
    __tablename__ = "exportacion"
    exportacion_id: Mapped[UUID] = mapped_column(primary_key=True)
    sub: Mapped[str] = mapped_column(String(64))
    reporte_id: Mapped[str] = mapped_column(String(40))
    nombre_archivo: Mapped[str] = mapped_column(String(120))
    archivo: Mapped[bytes] = mapped_column(LargeBinary)
    creada_en: Mapped[datetime] = mapped_column(Instante)
    expira_en: Mapped[datetime] = mapped_column(Instante)


@lru_cache
def motor():
    return create_engine(configuracion().database_url, pool_size=5, max_overflow=0, pool_pre_ping=True)


@lru_cache
def fabrica() -> sessionmaker[Session]:
    return sessionmaker(motor(), expire_on_commit=False)


@contextmanager
def transaccion() -> Iterator[Session]:
    with fabrica()() as sesion, sesion.begin():
        yield sesion
