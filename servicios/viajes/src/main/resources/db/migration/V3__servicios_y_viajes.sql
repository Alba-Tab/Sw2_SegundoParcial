-- Spec 003: Servicio (pedido) y Viaje (operación), 1:1 (D03). El viaje nace en el paso 1 de la saga.

CREATE TABLE servicio (
    servicio_id           uuid PRIMARY KEY,
    viaje_id              uuid        NOT NULL UNIQUE,
    cliente_id            uuid        NOT NULL REFERENCES cliente (cliente_id),
    cotizacion_id         uuid        NOT NULL,
    canal                 varchar(10) NOT NULL CHECK (canal IN ('PORTAL', 'TELEFONO')),
    creado_por            varchar(64) NOT NULL,
    workflow_id           varchar(80) NOT NULL UNIQUE,
    confirmacion_completa boolean     NOT NULL DEFAULT false,
    creado_en             timestamptz NOT NULL
);
CREATE INDEX servicio_cliente ON servicio (cliente_id, servicio_id DESC);

CREATE TABLE viaje (
    viaje_id           uuid PRIMARY KEY REFERENCES servicio (viaje_id),
    servicio_id        uuid         NOT NULL UNIQUE REFERENCES servicio (servicio_id),
    cliente_id         uuid         NOT NULL,
    cotizacion_id      uuid         NOT NULL,
    estado             varchar(24)  NOT NULL CHECK (estado IN ('PROGRAMANDO', 'CONFIRMADO', 'EN_RUTA', 'ENTREGADO',
                           'ENTREGA_OBSERVADA', 'ENTREGA_RECHAZADA', 'CERRADO', 'CANCELADO', 'REQUIERE_INTERVENCION')),
    motivo             varchar(40),
    detalle            varchar(600),
    ruta_id            uuid REFERENCES ruta (ruta_id),
    tipo_carga         varchar(20) CHECK (tipo_carga IN ('GRANOS', 'INSUMOS', 'INSUMOS_LIQUIDOS', 'CONTENEDOR')),
    toneladas          numeric(5,2) CHECK (toneladas > 0 AND toneladas <= 30),
    fecha_viaje        date,
    monto              numeric(14,2) CHECK (monto >= 0),
    reserva_unidad_id  uuid,
    tracto_id          uuid,
    remolque_id        uuid,
    placa              varchar(8),
    chofer_id          uuid,
    chofer_nombre      varchar(120),
    chofer_usuario_sub varchar(64),
    creado_en          timestamptz  NOT NULL,
    actualizado_en     timestamptz  NOT NULL,
    CHECK (estado IN ('PROGRAMANDO', 'CANCELADO', 'REQUIERE_INTERVENCION') OR placa IS NOT NULL),
    CHECK (estado <> 'CANCELADO' OR motivo IS NOT NULL)
);
CREATE INDEX viaje_estado ON viaje (estado);
CREATE INDEX viaje_chofer ON viaje (chofer_usuario_sub) WHERE chofer_usuario_sub IS NOT NULL;
