<?php

namespace App\Infraestructura\Log;

use App\Dominio\Comun\Uuid7;
use Illuminate\Support\Facades\Context;

/**
 * correlationId y traceparent (W3C Trace Context) de lo que se está procesando, en el Context de Laravel: los logs los
 * llevan (FormatoJson saca el traceId) y el Outbox los copia en el sobre de cada evento (000 §4, §6 y §10). Llegan en el
 * encabezado HTTP o en el sobre consumido; si faltan o no son válidos, se generan.
 */
final class Traza
{
    private const TRACEPARENT = '/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/';

    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

    /** Reemplaza todo el Context: nada de un mensaje o petición anterior queda en el siguiente. */
    public static function iniciar(mixed $correlationId, mixed $traceparent): void
    {
        Context::flush();
        Context::add([
            'correlationId' => self::correlacion($correlationId) ?? Uuid7::nuevo(),
            'traceparent' => self::traceparent($traceparent) ?? self::nuevoTraceparent(),
        ]);
    }

    /** UUID en minúsculas, o null si no lo es. */
    public static function correlacion(mixed $valor): ?string
    {
        $valor = is_string($valor) ? strtolower(trim($valor)) : '';

        return preg_match(self::UUID, $valor) ? $valor : null;
    }

    /** traceparent versión 00 con trace-id y parent-id distintos de cero, o null. */
    public static function traceparent(mixed $valor): ?string
    {
        $valor = is_string($valor) ? strtolower(trim($valor)) : '';
        if (! preg_match(self::TRACEPARENT, $valor, $m) || trim($m[1], '0') === '' || trim($m[2], '0') === '') {
            return null;
        }

        return $valor;
    }

    public static function nuevoTraceparent(): string
    {
        return sprintf('00-%s-%s-01', bin2hex(random_bytes(16)), bin2hex(random_bytes(8)));
    }

    public static function traceId(mixed $traceparent): ?string
    {
        $valido = self::traceparent($traceparent);

        return $valido === null ? null : substr($valido, 3, 32);
    }
}
