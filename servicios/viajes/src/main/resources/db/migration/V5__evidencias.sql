-- Spec 006 (D40a): evidencias subidas por partes a S3. La llave del objeto es viajes/{viajeId}/evidencias/{evidenciaId}.
CREATE TABLE evidencia (
    evidencia_id  uuid PRIMARY KEY,
    viaje_id      uuid        NOT NULL REFERENCES viaje (viaje_id),
    tipo          varchar(20) NOT NULL CHECK (tipo IN ('FOTO_ENTREGA', 'FIRMA', 'FOTO_RECHAZO', 'RECIBO_COMBUSTIBLE')),
    content_type  varchar(20) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    tamano_bytes  bigint      NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 15728640),
    upload_id     varchar(300) NOT NULL,
    estado        varchar(10) NOT NULL CHECK (estado IN ('SUBIENDO', 'COMPLETA')),
    creada_en     timestamptz NOT NULL DEFAULT now(),
    completada_en timestamptz
);
CREATE INDEX evidencia_viaje ON evidencia (viaje_id);
