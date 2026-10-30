<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Puertos\VersionDesactualizada;
use App\Dominio\Comun\ErrorDeDominio;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Autoridad de idempotencia de 000 §4.1 (operacion_idempotente). La clave se registra EN_PROCESO al empezar, la operación
 * corre y la clave pasa a COMPLETADA con la respuesta, todo en la misma transacción (spec 008, pasos 4.1 y 4.8). Un
 * reenvío simultáneo espera en el INSERT a que la primera termine y recibe la respuesta guardada.
 *
 * La huella cubre el método, la ruta, el `sub` del token y el cuerpo: la misma clave en otro recurso, con otro usuario o
 * con otro cuerpo responde 422 IDEMPOTENCIA_CUERPO_DISTINTO y nunca devuelve la respuesta de otra operación.
 *
 * Si otro cambio gana el bloqueo optimista (VersionDesactualizada), la transacción completa se repite hasta 3 veces
 * (spec 008); después sale 409 VERSION_DESACTUALIZADA.
 */
final class Idempotencia
{
    public const INTENTOS = 3;

    /** @param Closure(): JsonResponse $operacion */
    public function ejecutar(Request $req, string $tipo, Closure $operacion): JsonResponse
    {
        $clave = (string) $req->header('Idempotency-Key');
        $huella = self::huella($req->method(), '/'.ltrim($req->path(), '/'), self::sujeto($req), $req->json()->all());
        for ($intento = 1; ; $intento++) {
            try {
                return DB::transaction(fn () => $this->dentro($clave, $tipo, $huella, $operacion));
            } catch (VersionDesactualizada $e) {
                if ($intento >= self::INTENTOS) {
                    throw $e;
                }
            }
        }
    }

    private function dentro(string $clave, string $tipo, string $huella, Closure $operacion): JsonResponse
    {
        // ON CONFLICT DO NOTHING: si otra transacción tiene la clave sin confirmar, PostgreSQL espera a que termine.
        $nueva = DB::table('operacion_idempotente')->insertOrIgnore([
            'clave' => $clave, 'tipo_operacion' => $tipo, 'hash_cuerpo' => $huella, 'estado' => 'EN_PROCESO',
        ]) === 1;
        $fila = DB::table('operacion_idempotente')->where('clave', $clave)->lockForUpdate()->first();
        if (! $nueva) {
            return self::previa($fila, $tipo, $huella);
        }
        $respuesta = $operacion();
        DB::table('operacion_idempotente')->where('clave', $clave)->update([
            'estado' => 'COMPLETADA',
            'codigo_http' => $respuesta->getStatusCode(),
            'cuerpo_respuesta' => $respuesta->getContent(),
            'referencia' => $respuesta->headers->get('Location'),
            'actualizada_en' => now('UTC'),
        ]);

        return $respuesta;
    }

    private static function previa(?object $fila, string $tipo, string $huella): JsonResponse
    {
        if ($fila === null || $fila->tipo_operacion !== $tipo || $fila->hash_cuerpo !== $huella) {
            throw new ErrorDeDominio('IDEMPOTENCIA_CUERPO_DISTINTO', 'La clave ya se usó con otra petición');
        }
        if ($fila->estado === 'EN_PROCESO') {
            // Defensa: la clave nunca se confirma EN_PROCESO, porque la operación va en la misma transacción.
            throw new ErrorDeDominio('IDEMPOTENCIA_EN_PROCESO', 'La operación con esa clave sigue en proceso');
        }

        return new JsonResponse(json_decode((string) $fila->cuerpo_respuesta, true), (int) $fila->codigo_http,
            array_filter(['Location' => $fila->referencia]));
    }

    /** `sub` del token ya validado: la misma clave enviada por otro usuario es otra petición. */
    private static function sujeto(Request $req): string
    {
        $usuario = $req->attributes->get('usuario');

        return is_array($usuario) ? (string) ($usuario['sub'] ?? '') : '';
    }

    /**
     * SHA-256 del método, la ruta, el sujeto y el cuerpo con las llaves ordenadas: espacios u orden de campos no cambian
     * la huella; otro recurso, otro usuario u otro cuerpo, sí.
     */
    public static function huella(string $metodo, string $ruta, string $sujeto, mixed $cuerpo): string
    {
        $ordenar = function (mixed $v) use (&$ordenar): mixed {
            if (! is_array($v)) {
                return $v;
            }
            if (! array_is_list($v)) {
                ksort($v);
            }

            return array_map($ordenar, $v);
        };

        return hash('sha256', json_encode([strtoupper($metodo), $ruta, $sujeto, $ordenar($cuerpo)],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }
}
