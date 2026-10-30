<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Spec 008: pagos de facturas. La misma referencia y medio en una factura es un pago duplicado. */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE TABLE pago (
                pago_id        uuid PRIMARY KEY,
                factura_id     uuid          NOT NULL REFERENCES factura (factura_id),
                monto          numeric(14,2) NOT NULL CHECK (monto > 0),
                fecha          date          NOT NULL,
                medio          varchar(14)   NOT NULL CHECK (medio IN ('TRANSFERENCIA', 'DEPOSITO', 'EFECTIVO', 'CHEQUE')),
                referencia     varchar(40)   NOT NULL,
                nota           varchar(300),
                registrado_por varchar(64)   NOT NULL,
                registrado_en  timestamptz   NOT NULL,
                UNIQUE (factura_id, medio, referencia)
            );
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE pago');
    }
};
