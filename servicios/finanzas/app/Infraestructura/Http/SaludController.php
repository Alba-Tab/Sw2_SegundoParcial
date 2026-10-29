<?php

namespace App\Infraestructura\Http;

use App\Infraestructura\Mensajeria\ConexionAmqp;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** GET /health (vivo) y GET /health/ready (PostgreSQL y RabbitMQ), sin autenticación ni Keycloak (000 §4, P10). */
final class SaludController
{
    public function vivo(): JsonResponse
    {
        return new JsonResponse(['estado' => 'UP']);
    }

    public function listo(ConexionAmqp $amqp): JsonResponse
    {
        $postgres = rescue(fn () => DB::select('SELECT 1') ? 'UP' : 'DOWN', 'DOWN', false);
        $rabbitmq = $amqp->disponible() ? 'UP' : 'DOWN';
        $arriba = $postgres === 'UP' && $rabbitmq === 'UP';

        return new JsonResponse(['estado' => $arriba ? 'UP' : 'DOWN', 'dependencias' => compact('postgres', 'rabbitmq')], $arriba ? 200 : 503);
    }
}
