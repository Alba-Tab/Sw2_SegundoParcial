<?php

namespace App\Infraestructura\Http;

use App\Dominio\Comun\ErrorDeDominio;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Autoridad de idempotencia de 000 §4.1 (operacion_idempotente). La operación, su efecto y la respuesta guardada van
 * en la misma transacción. Reenvío con el mismo cuerpo: la respuesta guardada; con otro cuerpo: 422.
 */
final class Idempotencia
{
    /** @param Closure(): JsonResponse $operacion */
    public function ejecutar(Request $req, string $tipo, Closure $operacion): JsonResponse
    {
        $clave = (string) $req->header('Idempotency-Key');
        $hash = self::hash($req->json()->all());
        try {
            return DB::transaction(fn () => $this->dentro($clave, $tipo, $hash, $operacion));
        } catch (UniqueConstraintViolationException) {
            // Otra petición con la misma clave ganó la carrera: se responde lo que ella guardó.
            return DB::transaction(fn () => $this->dentro($clave, $tipo, $hash, fn () => throw new \LogicException('sin operación')));
        }
    }

    private function dentro(string $clave, string $tipo, string $hash, Closure $operacion): JsonResponse
    {
        $previa = DB::table('operacion_idempotente')->where('clave', $clave)->lockForUpdate()->first();
        if ($previa) {
            if ($previa->hash_cuerpo !== $hash) {
                throw new ErrorDeDominio('IDEMPOTENCIA_CUERPO_DISTINTO', 'La clave ya se usó con otro cuerpo');
            }
            if ($previa->estado === 'EN_PROCESO') {
                throw new ErrorDeDominio('IDEMPOTENCIA_EN_PROCESO', 'La operación con esa clave sigue en proceso');
            }

            return new JsonResponse(json_decode((string) $previa->cuerpo_respuesta, true), (int) $previa->codigo_http,
                array_filter(['Location' => $previa->referencia]));
        }
        $respuesta = $operacion();
        DB::table('operacion_idempotente')->insert([
            'clave' => $clave,
            'tipo_operacion' => $tipo,
            'hash_cuerpo' => $hash,
            'estado' => 'COMPLETADA',
            'codigo_http' => $respuesta->getStatusCode(),
            'cuerpo_respuesta' => $respuesta->getContent(),
            'referencia' => $respuesta->headers->get('Location'),
        ]);

        return $respuesta;
    }

    /** SHA-256 del cuerpo con las llaves ordenadas: espacios u orden de campos no cambian el hash. */
    public static function hash(mixed $cuerpo): string
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

        return hash('sha256', json_encode($ordenar($cuerpo), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}
