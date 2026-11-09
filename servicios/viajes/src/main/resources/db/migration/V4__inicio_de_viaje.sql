-- Spec 005: inicio del viaje por el chofer. Un chofer tiene como máximo un viaje EN_RUTA (D11).
ALTER TABLE viaje ADD COLUMN iniciado_en timestamptz;
ALTER TABLE viaje ADD CONSTRAINT viaje_en_ruta_iniciado CHECK (estado <> 'EN_RUTA' OR iniciado_en IS NOT NULL);
CREATE UNIQUE INDEX viaje_un_en_ruta_por_chofer ON viaje (chofer_usuario_sub) WHERE estado = 'EN_RUTA';
