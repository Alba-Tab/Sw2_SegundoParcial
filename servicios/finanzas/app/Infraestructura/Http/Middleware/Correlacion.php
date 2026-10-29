<?php

namespace App\Infraestructura\Http\Middleware;

use App\Dominio\Comun\Uuid7;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/** X-Correlation-Id (000 §4): lo genera si no viene o no es UUID, lo deja en Context (logs y Outbox) y lo devuelve. */
final class Correlacion
{
    public function handle(Request $req, Closure $siguiente): Response
    {
        $recibido = (string) $req->header('X-Correlation-Id');
        $id = Str::isUuid($recibido) ? strtolower($recibido) : Uuid7::nuevo();
        Context::add('correlationId', $id);
        $res = $siguiente($req);
        $res->headers->set('X-Correlation-Id', $id);

        return $res;
    }
}
