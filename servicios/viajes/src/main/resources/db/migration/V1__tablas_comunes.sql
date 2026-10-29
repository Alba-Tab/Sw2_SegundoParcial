-- Tablas comunes con el mismo nombre en todos los servicios (000 §4.1, §6 y §9).

CREATE TABLE operacion_idempotente (
    clave           uuid PRIMARY KEY,
    tipo_operacion  varchar(60)  NOT NULL,
    hash_cuerpo     char(64)     NOT NULL,
    estado          varchar(12)  NOT NULL CHECK (estado IN ('EN_PROCESO', 'COMPLETADA')),
    codigo_http     smallint,
    cuerpo_respuesta jsonb,
    referencia      varchar(200),
    creada_en       timestamptz  NOT NULL DEFAULT now(),
    actualizada_en  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE outbox_eventos (
    id                 uuid PRIMARY KEY,
    tipo               varchar(60)  NOT NULL,
    clave_enrutamiento varchar(120) NOT NULL,
    sobre              jsonb        NOT NULL,
    creado_en          timestamptz  NOT NULL,
    publicado_en       timestamptz
);
CREATE INDEX outbox_eventos_pendientes ON outbox_eventos (creado_en) WHERE publicado_en IS NULL;

CREATE TABLE inbox_eventos (
    event_id     uuid PRIMARY KEY,
    tipo         varchar(60) NOT NULL,
    procesado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
    id             uuid PRIMARY KEY,
    ocurrido_en    timestamptz  NOT NULL,
    actor_sub      varchar(64),
    actor_rol      varchar(30),
    canal          varchar(20)  NOT NULL CHECK (canal IN ('PORTAL', 'TELEFONO', 'CENTRO_CONTROL', 'APP_CHOFER', 'SISTEMA')),
    accion         varchar(60)  NOT NULL,
    entidad        varchar(60)  NOT NULL,
    entidad_id     uuid,
    datos          jsonb,
    correlation_id uuid
);
CREATE INDEX auditoria_entidad ON auditoria (entidad, entidad_id);
