"""Modelo de lectura, alertas, idempotencia y auditoría (spec 013).

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE inbox_eventos (
          evento_id uuid PRIMARY KEY, tipo varchar(60) NOT NULL,
          ocurrido_en timestamptz NOT NULL, procesado_en timestamptz NOT NULL);
        CREATE TABLE estado_lectura (id integer PRIMARY KEY, datos_al timestamptz);
        INSERT INTO estado_lectura VALUES (1, NULL);

        CREATE TABLE cliente (
          cliente_id uuid PRIMARY KEY, version integer NOT NULL, razon_social varchar(200) NOT NULL,
          nit varchar(20), correo varchar(200), activo boolean NOT NULL DEFAULT true);
        CREATE TABLE ruta (
          ruta_id uuid PRIMARY KEY, version integer NOT NULL, nombre varchar(120) NOT NULL,
          origen_nombre varchar(120), destino_nombre varchar(120),
          origen_lat double precision, origen_lng double precision,
          destino_lat double precision, destino_lng double precision,
          distancia_km numeric(8,1) NOT NULL, activa boolean NOT NULL DEFAULT true);
        CREATE TABLE chofer (
          chofer_id uuid PRIMARY KEY, version integer NOT NULL, nombre varchar(160) NOT NULL,
          usuario_sub varchar(64), activo boolean NOT NULL DEFAULT true);

        CREATE TABLE hecho_viaje (
          viaje_id uuid PRIMARY KEY, servicio_id uuid, cliente_id uuid, ruta_id uuid,
          tipo_carga varchar(30), toneladas numeric(6,2), fecha_viaje date, monto numeric(14,2), canal varchar(20),
          placa varchar(10), tracto_id uuid, remolque_id uuid, chofer_id uuid, chofer_nombre varchar(160),
          estado varchar(30) NOT NULL DEFAULT 'DESCONOCIDO',
          confirmado_en timestamptz, iniciado_en timestamptz, terminado_en timestamptz,
          ultima_lat double precision, ultima_lng double precision, ultima_velocidad double precision,
          ultima_posicion_en timestamptz,
          bloqueos integer NOT NULL DEFAULT 0, fallas integer NOT NULL DEFAULT 0,
          km_recorridos numeric(8,1), motivo_fin text, actualizado_en timestamptz);
        CREATE INDEX hecho_viaje_estado ON hecho_viaje (estado);
        CREATE TABLE posicion_viaje (
          viaje_id uuid NOT NULL, registrada_en timestamptz NOT NULL,
          lat double precision NOT NULL, lng double precision NOT NULL, velocidad_kmh double precision NOT NULL,
          PRIMARY KEY (viaje_id, registrada_en));
        CREATE TABLE hito_viaje (
          hito_id uuid PRIMARY KEY, viaje_id uuid NOT NULL, tipo varchar(30) NOT NULL,
          registrado_en timestamptz NOT NULL);

        CREATE TABLE hecho_factura (
          factura_id uuid PRIMARY KEY, numero varchar(30) NOT NULL, viaje_id uuid, servicio_id uuid,
          cliente_id uuid NOT NULL, razon_social varchar(200), monto numeric(14,2) NOT NULL,
          saldo numeric(14,2) NOT NULL, emitida_el date NOT NULL, vence_el date NOT NULL,
          estado varchar(20) NOT NULL DEFAULT 'EMITIDA');
        CREATE INDEX hecho_factura_vence ON hecho_factura (vence_el);
        CREATE TABLE hecho_pago (
          pago_id uuid PRIMARY KEY, factura_id uuid NOT NULL, cliente_id uuid NOT NULL,
          monto numeric(14,2) NOT NULL, fecha date NOT NULL, medio varchar(30));

        CREATE TABLE hecho_combustible (
          carga_id uuid PRIMARY KEY, tracto_id uuid NOT NULL, placa varchar(10) NOT NULL, chofer_id uuid,
          viaje_id uuid, litros numeric(8,2) NOT NULL, monto numeric(14,2) NOT NULL, kilometraje integer NOT NULL,
          registrada_en timestamptz NOT NULL, km_por_litro numeric(8,3),
          referencia varchar(20) NOT NULL DEFAULT 'SIN_REFERENCIA',
          puntaje_anomalia double precision, es_anomalia boolean NOT NULL DEFAULT false);
        CREATE INDEX hecho_combustible_tracto ON hecho_combustible (tracto_id, kilometraje);
        CREATE TABLE caida_combustible (
          deteccion_id uuid PRIMARY KEY, tracto_id uuid NOT NULL, placa varchar(10) NOT NULL, viaje_id uuid,
          caida_pct double precision NOT NULL, nivel_anterior_pct double precision NOT NULL,
          nivel_actual_pct double precision NOT NULL, detectada_en timestamptz NOT NULL);
        CREATE TABLE hecho_conduccion (
          evento_id uuid PRIMARY KEY, viaje_id uuid NOT NULL, chofer_id uuid NOT NULL, tipo varchar(20) NOT NULL,
          magnitud_g double precision, registrado_en timestamptz NOT NULL);
        CREATE TABLE hecho_mantenimiento (
          evento_id uuid PRIMARY KEY, unidad_id uuid NOT NULL, tipo_unidad varchar(20) NOT NULL,
          placa varchar(10) NOT NULL, motivos varchar(30)[] NOT NULL, km_desde_ultimo integer,
          requerido_en timestamptz NOT NULL);
        CREATE TABLE prediccion_retraso (
          viaje_id uuid PRIMARY KEY, probabilidad double precision NOT NULL, calculada_en timestamptz NOT NULL,
          modelo_version varchar(40) NOT NULL, factores jsonb NOT NULL);

        CREATE TABLE alerta (
          alerta_id uuid PRIMARY KEY, secuencia bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
          tipo varchar(40) NOT NULL, severidad varchar(10) NOT NULL, roles varchar(30)[] NOT NULL,
          titulo varchar(200) NOT NULL, detalle text NOT NULL, entidad_tipo varchar(10) NOT NULL,
          entidad_id varchar(64) NOT NULL, enlace varchar(200) NOT NULL, estado varchar(10) NOT NULL,
          origen varchar(80) NOT NULL, creada_en timestamptz NOT NULL, actualizada_en timestamptz NOT NULL,
          atendida_por varchar(64), nota varchar(300));
        -- Una alerta abierta por causa (spec 013).
        CREATE UNIQUE INDEX alerta_abierta_por_causa ON alerta (tipo, entidad_id) WHERE estado = 'ABIERTA';
        CREATE INDEX alerta_estado ON alerta (estado, secuencia);

        CREATE TABLE operacion_idempotente (
          clave uuid PRIMARY KEY, operacion varchar(60) NOT NULL, sub varchar(64) NOT NULL,
          hash_cuerpo varchar(64) NOT NULL, status integer NOT NULL, respuesta jsonb NOT NULL,
          creada_en timestamptz NOT NULL);
        CREATE TABLE auditoria (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ocurrido_en timestamptz NOT NULL,
          actor_sub varchar(64) NOT NULL, actor_rol varchar(30), accion varchar(60) NOT NULL,
          entidad_id varchar(64), correlation_id varchar(64), datos jsonb NOT NULL);
        CREATE TABLE exportacion (
          exportacion_id uuid PRIMARY KEY, sub varchar(64) NOT NULL, reporte_id varchar(40) NOT NULL,
          nombre_archivo varchar(120) NOT NULL, archivo bytea NOT NULL, creada_en timestamptz NOT NULL,
          expira_en timestamptz NOT NULL);
        """
    )
