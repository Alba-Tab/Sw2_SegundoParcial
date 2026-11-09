<?php

namespace App\Infraestructura\Http\Middleware;

use App\Infraestructura\Log\Traza;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Symfony\Component\HttpFoundation\Response;

/**
 * X-Correlation-Id y traceparent (000 §4): los toma del encabezado (o los genera si no vienen o no son válidos), los deja
 * en Context para los logs y el Outbox, y devuelve X-Correlation-Id.
 */
final class Correlacion
{
    public function handle(Request $req, Closure $siguiente): Response
    {
        Traza::iniciar($req->header('X-Correlation-Id'), $req->header('traceparent'));
        $id = (string) Context::get('correlationId');
        $res = $siguiente($req);
        $res->headers->set('X-Correlation-Id', $id);

        return $res;
    }
}
