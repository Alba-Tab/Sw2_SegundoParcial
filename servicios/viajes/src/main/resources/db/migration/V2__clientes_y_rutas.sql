-- Spec 001 (Cliente) y 002 (Ruta, D06).

CREATE TABLE cliente (
    cliente_id       uuid PRIMARY KEY,
    sub              varchar(64) UNIQUE,
    razon_social     varchar(120) NOT NULL,
    nit              varchar(20)  NOT NULL,
    correo           varchar(254) NOT NULL,
    telefono         varchar(20)  NOT NULL,
    direccion        varchar(200) NOT NULL,
    canal            varchar(10)  NOT NULL CHECK (canal IN ('PORTAL', 'TELEFONO')),
    vinculado        boolean      NOT NULL DEFAULT false,
    creado_por       varchar(64),
    creado_en        timestamptz  NOT NULL,
    version_agregado integer      NOT NULL,
    activo           boolean      NOT NULL DEFAULT true,
    CHECK (sub IS NOT NULL OR vinculado = false)
);
-- El NIT es único entre clientes activos (spec 001).
CREATE UNIQUE INDEX cliente_nit_activo ON cliente (nit) WHERE activo;
CREATE INDEX cliente_razon_social ON cliente (lower(razon_social));

CREATE TABLE ruta (
    ruta_id          uuid PRIMARY KEY,
    nombre           varchar(80)  NOT NULL,
    origen_nombre    varchar(80)  NOT NULL,
    origen_lat       double precision NOT NULL,
    origen_lng       double precision NOT NULL,
    destino_nombre   varchar(80)  NOT NULL,
    destino_lat      double precision NOT NULL,
    destino_lng      double precision NOT NULL,
    radio_metros     integer      NOT NULL CHECK (radio_metros BETWEEN 50 AND 5000),
    distancia_km     numeric(8,1) NOT NULL CHECK (distancia_km > 0),
    activa           boolean      NOT NULL DEFAULT true,
    version_agregado integer      NOT NULL
);
