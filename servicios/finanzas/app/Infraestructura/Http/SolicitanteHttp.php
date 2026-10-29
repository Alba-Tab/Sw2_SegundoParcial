<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Comun\Solicitante;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;

/** El solicitante a partir del token ya validado por el middleware Autenticacion. */
final class SolicitanteHttp
{
    public static function de(Request $req): Solicitante
    {
        $u = $req->attributes->get('usuario');
        if (! is_array($u)) {
            throw new AuthenticationException('Falta el token');
        }

        return new Solicitante($u['sub'], $u['roles'], $u['clienteId']);
    }
}
