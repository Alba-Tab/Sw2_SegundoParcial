<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Dominio\Comun\Uuid7;
use App\Infraestructura\Log\Traza;
use App\Infraestructura\Mensajeria\ValidadorEventos;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;

/**
 * Escribe el sobre común (000 §6) en outbox_eventos dentro de la transacción del caso de uso, después de validarlo
 * contra su esquema. correlationId y traceparent salen del Context (la petición HTTP o el evento consumido, ver Traza);
 * si no hay ninguno en curso (una actividad de Temporal), se generan.
 */
final class RegistroDeEventosOutbox implements RegistroDeEventos
{
    public function __construct(private readonly ValidadorEventos $validador) {}

    public function registrar(string $tipo, string $claveEnrutamiento, array $datos): void
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('RegistroDeEventos::registrar se usa solo dentro de una transacción');
        }
        $id = Uuid7::nuevo();
        $ahora = now('UTC');
        $version = (int) substr($claveEnrutamiento, strrpos($claveEnrutamiento, '.v') + 2);
        $sobre = [
            'id' => $id,
            'tipo' => $tipo,
            'version' => $version,
            'ocurridoEn' => $ahora->format('Y-m-d\TH:i:s\Z'),
            'correlationId' => Traza::correlacion(Context::get('correlationId')) ?? Uuid7::nuevo(),
            'traceparent' => Traza::traceparent(Context::get('traceparent')) ?? Traza::nuevoTraceparent(),
            'productor' => 'finanzas',
            'datos' => $datos,
        ];
        $this->validador->validar('finanzas', $tipo, $version, $sobre);
        DB::table('outbox_eventos')->insert([
            'id' => $id,
            'tipo' => $tipo,
            'clave_enrutamiento' => $claveEnrutamiento,
            'sobre' => json_encode($sobre, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'creado_en' => $ahora,
        ]);
    }
}
