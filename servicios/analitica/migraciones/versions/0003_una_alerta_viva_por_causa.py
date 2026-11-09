"""Una sola alerta viva (ABIERTA o ATENDIDA) por causa en los tipos que se resuelven solos (spec 013).

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"

# Igual que app.dominio.alertas.TIPOS_QUE_SE_RESUELVEN, en el mismo orden.
TIPOS = "'ENTREGA_OBSERVADA', 'VIAJE_REQUIERE_INTERVENCION', 'RIESGO_RETRASO', 'ACCION_PROPUESTA'"


def upgrade() -> None:
    # Antes de esta migración, una predicción después de atender abría otra RIESGO_RETRASO: queda la primera.
    op.execute(
        f"""
        UPDATE alerta a SET estado = 'RESUELTA', actualizada_en = now()
         WHERE a.tipo IN ({TIPOS}) AND a.estado IN ('ABIERTA', 'ATENDIDA')
           AND EXISTS (SELECT 1 FROM alerta b
                        WHERE b.tipo = a.tipo AND b.entidad_id = a.entidad_id
                          AND b.estado IN ('ABIERTA', 'ATENDIDA') AND b.secuencia < a.secuencia);
        CREATE UNIQUE INDEX alerta_viva_por_causa ON alerta (tipo, entidad_id)
         WHERE estado IN ('ABIERTA', 'ATENDIDA') AND tipo IN ({TIPOS});
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX alerta_viva_por_causa")
