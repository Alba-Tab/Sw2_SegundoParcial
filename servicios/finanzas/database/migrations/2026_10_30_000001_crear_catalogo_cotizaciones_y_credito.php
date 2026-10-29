<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Specs 001 y 002: copias de cliente y ruta, tarifas (D10), cotizaciones y líneas de crédito (D01). */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE TABLE cliente_copia (
                cliente_id       uuid PRIMARY KEY,
                razon_social     varchar(120) NOT NULL,
                nit              varchar(20)  NOT NULL,
                correo           varchar(254) NOT NULL,
                telefono         varchar(20)  NOT NULL,
                direccion        varchar(200) NOT NULL,
                canal            varchar(10)  NOT NULL,
                tiene_cuenta     boolean      NOT NULL,
                activo           boolean      NOT NULL,
                version_agregado integer      NOT NULL
            );
            CREATE TABLE ruta_copia (
                ruta_id          uuid PRIMARY KEY,
                nombre           varchar(80)  NOT NULL,
                distancia_km     numeric(8,1) NOT NULL,
                activa           boolean      NOT NULL,
                version_agregado integer      NOT NULL,
                datos            jsonb        NOT NULL
            );
            CREATE TABLE tarifa (
                ruta_id      uuid        NOT NULL,
                tipo_carga   varchar(20) NOT NULL CHECK (tipo_carga IN ('GRANOS', 'INSUMOS', 'INSUMOS_LIQUIDOS', 'CONTENEDOR')),
                por_tonelada numeric(14,2) NOT NULL CHECK (por_tonelada > 0),
                PRIMARY KEY (ruta_id, tipo_carga)
            );
            CREATE TABLE cotizacion (
                cotizacion_id   uuid PRIMARY KEY,
                cliente_id      uuid          NOT NULL,
                ruta_id         uuid          NOT NULL,
                tipo_carga      varchar(20)   NOT NULL,
                toneladas       numeric(5,2)  NOT NULL CHECK (toneladas > 0 AND toneladas <= 30),
                fecha_viaje     date          NOT NULL,
                tarifa          numeric(14,2) NOT NULL,
                monto           numeric(14,2) NOT NULL CHECK (monto >= 0),
                estado          varchar(10)   NOT NULL CHECK (estado IN ('VIGENTE', 'ACEPTADA')),
                vence_en        timestamptz   NOT NULL,
                canal           varchar(10)   NOT NULL,
                creada_en       timestamptz   NOT NULL
            );
            CREATE INDEX cotizacion_cliente ON cotizacion (cliente_id, cotizacion_id);
            CREATE TABLE linea_credito (
                cliente_id uuid PRIMARY KEY,
                limite     numeric(14,2) NOT NULL CHECK (limite >= 0),
                reservado  numeric(14,2) NOT NULL DEFAULT 0 CHECK (reservado >= 0),
                utilizado  numeric(14,2) NOT NULL DEFAULT 0 CHECK (utilizado >= 0),
                version    integer       NOT NULL DEFAULT 0,
                CHECK (reservado + utilizado <= limite)
            );
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE linea_credito, cotizacion, tarifa, ruta_copia, cliente_copia');
    }
};
