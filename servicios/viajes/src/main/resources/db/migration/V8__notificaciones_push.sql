-- D45: cada evento del Outbox avisa por push una sola vez (idempotente por eventId), después del commit.
CREATE TABLE notificacion_push (
    evento_id   uuid PRIMARY KEY,
    tipo        varchar(60) NOT NULL,
    resultado   varchar(30) NOT NULL,
    procesada_en timestamptz NOT NULL DEFAULT now()
);
