<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** 000 §9: la línea de crédito se protege solo con FOR UPDATE; la versión optimista nunca podía fallar. */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared('ALTER TABLE linea_credito DROP COLUMN version');
    }

    public function down(): void
    {
        DB::unprepared('ALTER TABLE linea_credito ADD COLUMN version integer NOT NULL DEFAULT 0');
    }
};
