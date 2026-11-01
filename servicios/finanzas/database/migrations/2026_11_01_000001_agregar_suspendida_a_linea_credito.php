<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Spec 012 (G6): administración o gerente suspende la línea; la saga ya no reserva sobre ella. */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared('ALTER TABLE linea_credito ADD COLUMN suspendida boolean NOT NULL DEFAULT false');
    }

    public function down(): void
    {
        DB::unprepared('ALTER TABLE linea_credito DROP COLUMN suspendida');
    }
};
