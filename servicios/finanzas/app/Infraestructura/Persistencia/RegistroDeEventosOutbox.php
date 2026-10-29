<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Dominio\Comun\Uuid7;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;

/** Escribe el sobre común (000 §6) en outbox_eventos dentro de la transacción del caso de uso. */
final class RegistroDeEventosOutbox implements RegistroDeEventos
{
    public function registrar(string $tipo, string $claveEnrutamiento, array $datos): void
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('RegistroDeEventos::registrar se usa solo dentro de una transacción');
        }
        $id = Uuid7::nuevo();
        $ahora = now('UTC');
        $sobre = [
            'id' => $id,
            'tipo' => $tipo,
            'version' => (int) substr($claveEnrutamiento, strrpos($claveEnrutamiento, '.v') + 2),
            'ocurridoEn' => $ahora->format('Y-m-d\TH:i:s\Z'),
            'correlationId' => Context::get('correlationId'),
            'productor' => 'finanzas',
            'datos' => $datos,
        ];
        DB::table('outbox_eventos')->insert([
            'id' => $id,
            'tipo' => $tipo,
            'clave_enrutamiento' => $claveEnrutamiento,
            'sobre' => json_encode($sobre, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'creado_en' => $ahora,
        ]);
    }
}
