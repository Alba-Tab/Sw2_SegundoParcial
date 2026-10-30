<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Dominio\Comun\Uuid7;
use App\Infraestructura\Mensajeria\ValidadorEventos;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;

/**
 * Escribe el sobre común (000 §6) en outbox_eventos dentro de la transacción del caso de uso, después de validarlo
 * contra su esquema. correlationId y traceparent son obligatorios en el sobre: si no hay petición ni traza en curso
 * (un consumidor, una actividad), se generan.
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
        $correlacion = Context::get('correlationId');
        $traza = Context::get('traceparent');
        $sobre = [
            'id' => $id,
            'tipo' => $tipo,
            'version' => $version,
            'ocurridoEn' => $ahora->format('Y-m-d\TH:i:s\Z'),
            'correlationId' => is_string($correlacion) && preg_match('/^[0-9a-f-]{36}$/', $correlacion) ? $correlacion : Uuid7::nuevo(),
            'traceparent' => is_string($traza) ? $traza : sprintf('00-%s-%s-01', bin2hex(random_bytes(16)), bin2hex(random_bytes(8))),
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
