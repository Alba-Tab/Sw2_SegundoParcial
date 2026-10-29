<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Spec 003 y 012: reservas de crédito (una por servicio) y solicitudes de aprobación. La tabla factura (spec 006) se
 * crea ya porque la mora (D04) se calcula sobre ella y la semilla (T4.8) trae una factura vencida.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE TABLE reserva_credito (
                reserva_credito_id uuid PRIMARY KEY,
                servicio_id        uuid          NOT NULL UNIQUE,
                cliente_id         uuid          NOT NULL REFERENCES linea_credito (cliente_id),
                cotizacion_id      uuid          NOT NULL REFERENCES cotizacion (cotizacion_id),
                monto              numeric(14,2) NOT NULL CHECK (monto >= 0),
                estado             varchar(22)   NOT NULL CHECK (estado IN ('ACTIVA', 'PENDIENTE_APROBACION', 'CONSUMIDA', 'LIBERADA')),
                motivo_liberacion  varchar(40),
                creada_en          timestamptz   NOT NULL DEFAULT now(),
                actualizada_en     timestamptz   NOT NULL DEFAULT now()
            );
            CREATE INDEX reserva_credito_cliente ON reserva_credito (cliente_id) WHERE estado IN ('ACTIVA', 'PENDIENTE_APROBACION');
            CREATE TABLE solicitud_aprobacion (
                servicio_id     uuid PRIMARY KEY REFERENCES reserva_credito (servicio_id),
                cliente_id      uuid          NOT NULL,
                monto           numeric(14,2) NOT NULL,
                motivos         varchar(10)[] NOT NULL CHECK (cardinality(motivos) BETWEEN 1 AND 2),
                estado          varchar(10)   NOT NULL CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'VENCIDA')),
                creada_en       timestamptz   NOT NULL,
                vence_en        timestamptz   NOT NULL,
                decidida_por    varchar(64),
                decidida_en     timestamptz,
                motivo_decision varchar(300),
                CHECK (estado = 'PENDIENTE' OR (decidida_por IS NOT NULL AND decidida_en IS NOT NULL))
            );
            CREATE INDEX solicitud_aprobacion_estado ON solicitud_aprobacion (estado, servicio_id);
            CREATE SEQUENCE factura_numero_seq;
            CREATE TABLE factura (
                factura_id   uuid PRIMARY KEY,
                numero       varchar(10)   NOT NULL UNIQUE CHECK (numero ~ '^FAC-[0-9]{6}$'),
                viaje_id     uuid          NOT NULL UNIQUE,
                servicio_id  uuid          NOT NULL,
                cliente_id   uuid          NOT NULL,
                monto        numeric(14,2) NOT NULL CHECK (monto >= 0),
                saldo        numeric(14,2) NOT NULL CHECK (saldo >= 0 AND saldo <= monto),
                estado       varchar(14)   NOT NULL CHECK (estado IN ('EMITIDA', 'PAGADA_PARCIAL', 'PAGADA')),
                emitida_el   date          NOT NULL,
                vence_el     date          NOT NULL,
                ruta_id      uuid,
                tipo_carga   varchar(20),
                toneladas    numeric(5,2),
                fecha_viaje  date,
                creada_en    timestamptz   NOT NULL DEFAULT now()
            );
            CREATE INDEX factura_cliente_saldo ON factura (cliente_id, vence_el) WHERE saldo > 0;
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE factura, solicitud_aprobacion, reserva_credito; DROP SEQUENCE factura_numero_seq');
    }
};
