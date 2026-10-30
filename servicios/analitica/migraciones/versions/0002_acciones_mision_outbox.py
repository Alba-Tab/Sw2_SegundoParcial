"""Acciones propuestas, misiones del agente y Outbox (spec 014).

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE mision (
          mision_id uuid PRIMARY KEY, estado varchar(12) NOT NULL, origen varchar(12) NOT NULL,
          disparada_por varchar(64), iniciada_en timestamptz NOT NULL, terminada_en timestamptz,
          codigo varchar(40), trace_id varchar(32), acciones_creadas integer NOT NULL DEFAULT 0,
          pasos jsonb NOT NULL DEFAULT '[]', conclusion text);
        CREATE INDEX mision_iniciada ON mision (iniciada_en DESC);

        CREATE TABLE accion_propuesta (
          accion_id uuid PRIMARY KEY, tipo varchar(40) NOT NULL, viaje_id uuid NOT NULL, servicio_id uuid,
          cliente_id uuid NOT NULL, mensaje varchar(1000) NOT NULL, evidencia jsonb NOT NULL,
          estado varchar(12) NOT NULL, mision_id uuid, creada_en timestamptz NOT NULL,
          decidida_por varchar(64), decidida_en timestamptz, motivo_rechazo varchar(300));
        -- Una acción por (tipo, viaje) en cualquier estado salvo ARCHIVADA (spec 014).
        CREATE UNIQUE INDEX accion_una_por_viaje ON accion_propuesta (tipo, viaje_id) WHERE estado <> 'ARCHIVADA';
        CREATE INDEX accion_estado ON accion_propuesta (estado, creada_en DESC);

        CREATE TABLE outbox (
          evento_id uuid PRIMARY KEY, clave_enrutamiento varchar(80) NOT NULL, sobre jsonb NOT NULL,
          creado_en timestamptz NOT NULL, publicado_en timestamptz, reclamado_hasta timestamptz);
        CREATE INDEX outbox_pendiente ON outbox (creado_en) WHERE publicado_en IS NULL;
        """
    )
