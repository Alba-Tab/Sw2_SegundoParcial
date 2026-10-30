-- Spec 005: la última posición para el mapa en vivo (el recorrido completo vive en DynamoDB), la bitácora de hitos,
-- los eventos de conducción y el celular de cada chofer (D45).
CREATE TABLE ultima_posicion (
    viaje_id       uuid PRIMARY KEY REFERENCES viaje (viaje_id),
    lat            double precision NOT NULL,
    lng            double precision NOT NULL,
    velocidad_kmh  numeric(6, 2)    NOT NULL,
    registrada_en  timestamptz      NOT NULL,
    dispositivo_id uuid             NOT NULL,
    actualizada_en timestamptz      NOT NULL DEFAULT now()
);

CREATE TABLE hito (
    hito_id       uuid PRIMARY KEY,
    viaje_id      uuid             NOT NULL REFERENCES viaje (viaje_id),
    tipo          text             NOT NULL CHECK (tipo IN ('BLOQUEO', 'PARADA', 'PUNTO_CONTROL', 'FALLA_MECANICA', 'OTRO')),
    descripcion   text             NOT NULL,
    lat           double precision NOT NULL,
    lng           double precision NOT NULL,
    registrado_en timestamptz      NOT NULL,
    origen        text             NOT NULL CHECK (origen IN ('VOZ', 'TEXTO')),
    creado_en     timestamptz      NOT NULL DEFAULT now()
);
CREATE INDEX hito_viaje ON hito (viaje_id, registrado_en DESC);

CREATE TABLE evento_conduccion (
    evento_id     uuid PRIMARY KEY,
    viaje_id      uuid             NOT NULL REFERENCES viaje (viaje_id),
    tipo          text             NOT NULL CHECK (tipo IN ('FRENADA_BRUSCA', 'ALERTA_FATIGA')),
    magnitud_g    numeric(4, 2),
    lat           double precision NOT NULL,
    lng           double precision NOT NULL,
    registrado_en timestamptz      NOT NULL,
    creado_en     timestamptz      NOT NULL DEFAULT now()
);
CREATE INDEX evento_conduccion_viaje ON evento_conduccion (viaje_id, registrado_en);

CREATE TABLE dispositivo (
    dispositivo_id uuid PRIMARY KEY,
    usuario_sub    text        NOT NULL,
    plataforma     text        NOT NULL CHECK (plataforma IN ('ANDROID', 'IOS')),
    token_push     text,
    actualizado_en timestamptz NOT NULL
);
CREATE INDEX dispositivo_usuario ON dispositivo (usuario_sub);
