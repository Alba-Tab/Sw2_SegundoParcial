-- Specs 006 y 007: la entrega (o el rechazo del receptor) y el cierre con la factura.
ALTER TABLE viaje ADD COLUMN entregado_en timestamptz;
ALTER TABLE viaje ADD COLUMN factura_id uuid;
ALTER TABLE viaje ADD COLUMN numero_factura varchar(10);

CREATE TABLE entrega (
    entrega_id         uuid PRIMARY KEY,
    viaje_id           uuid        NOT NULL UNIQUE REFERENCES viaje (viaje_id),
    tipo               varchar(20) NOT NULL CHECK (tipo IN ('ENTREGA', 'RECHAZO_RECEPTOR')),
    registrada_en      timestamptz NOT NULL,
    lat                double precision NOT NULL,
    lng                double precision NOT NULL,
    precision_metros   double precision,
    distancia_metros   double precision NOT NULL,
    dentro_geocerca    boolean     NOT NULL,
    con_firma          boolean     NOT NULL,
    razones            varchar(20)[] NOT NULL DEFAULT '{}',
    nombre_receptor    varchar(120),
    firma_evidencia_id uuid REFERENCES evidencia (evidencia_id),
    fotos              uuid[]      NOT NULL,
    observacion        varchar(500),
    motivo             varchar(300),
    decision           varchar(10) CHECK (decision IN ('APROBADA', 'RECHAZADA')),
    decidida_por       varchar(64),
    creada_en          timestamptz NOT NULL DEFAULT now()
);
