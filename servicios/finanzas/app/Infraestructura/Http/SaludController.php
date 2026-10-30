<?php

namespace App\Infraestructura\Http;

use App\Infraestructura\Mensajeria\ConexionAmqp;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * GET /health (vivo) y GET /health/ready (PostgreSQL, Temporal y RabbitMQ, como dice finanzas.yaml), sin autenticación
 * ni Keycloak (000 §4, P10). Temporal se revisa abriendo una conexión TCP a TEMPORAL_ADDRESS: el SDK de PHP no trae un
 * cliente gRPC sin la extensión grpc, que la imagen no instala.
 */
final class SaludController
{
    public function vivo(): JsonResponse
    {
        return new JsonResponse(['estado' => 'UP']);
    }

    public function listo(ConexionAmqp $amqp): JsonResponse
    {
        $postgres = rescue(fn () => DB::select('SELECT 1') ? 'UP' : 'DOWN', 'DOWN', false);
        $temporal = self::alcanzable((string) config('servicio.temporal')) ? 'UP' : 'DOWN';
        $rabbitmq = $amqp->disponible() ? 'UP' : 'DOWN';
        $arriba = $postgres === 'UP' && $temporal === 'UP' && $rabbitmq === 'UP';

        return new JsonResponse(['estado' => $arriba ? 'UP' : 'DOWN', 'dependencias' => compact('postgres', 'temporal', 'rabbitmq')],
            $arriba ? 200 : 503);
    }

    /** host:puerto acepta conexiones TCP en 1 s. */
    private static function alcanzable(string $direccion): bool
    {
        if ($direccion === '') {
            return false;
        }
        $socket = @stream_socket_client("tcp://{$direccion}", $codigo, $error, 1.0);
        if ($socket === false) {
            return false;
        }
        fclose($socket);

        return true;
    }
}
