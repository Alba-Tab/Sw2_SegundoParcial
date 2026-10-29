<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reservas_credito', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('servicio_id')->unique();
            $t->uuid('cliente_id');
            $t->string('estado', 20);
            $t->string('motivo_liberacion', 40)->nullable();
            $t->timestamps();
        });
    }
};
