<?php

namespace App\Infraestructura\Http\Middleware;

use App\Infraestructura\Http\Problemas;
use Closure;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * /api/** exige un JWT de Keycloak con emisor OIDC_ISSUER y audiencia "finanzas" (000 §8). Las llaves se bajan en la
 * primera petición y se guardan en memoria del worker de Octane 10 min (o hasta ver un `kid` nuevo), así Finanzas
 * arranca sin Keycloak. P10: sin OIDC_ISSUER, /api/** responde 503 DEPENDENCIA_NO_DISPONIBLE.
 */
final class Autenticacion
{
    /** @var array<string, \Firebase\JWT\Key>|null */
    private static ?array $llaves = null;

    private static int $vencen = 0;

    public function handle(Request $req, Closure $siguiente): Response
    {
        $issuer = config('servicio.oidc_issuer');
        if ($issuer === '') {
            return Problemas::respuesta('DEPENDENCIA_NO_DISPONIBLE', 'Identidad no configurada', 'OIDC_ISSUER no está configurado', 503, [], ['Retry-After' => '30']);
        }
        $token = $req->bearerToken();
        if (! $token) {
            return Problemas::respuesta('NO_AUTENTICADO', 'No autenticado', 'Falta el token');
        }
        try {
            $claims = JWT::decode($token, $this->llaves($issuer, $token));
        } catch (\Throwable) {
            return Problemas::respuesta('NO_AUTENTICADO', 'No autenticado', 'El token no es válido');
        }
        $aud = (array) ($claims->aud ?? []);
        if (($claims->iss ?? null) !== $issuer || ! in_array(config('servicio.audiencia'), $aud, true)) {
            return Problemas::respuesta('NO_AUTENTICADO', 'No autenticado', 'Emisor o audiencia incorrectos');
        }
        $req->attributes->set('usuario', [
            'sub' => (string) $claims->sub,
            'roles' => array_values((array) ($claims->realm_access->roles ?? [])),
            'clienteId' => $claims->clienteId ?? null,
        ]);

        return $siguiente($req);
    }

    /** @return array<string, \Firebase\JWT\Key> */
    private function llaves(string $issuer, string $token): array
    {
        $kid = json_decode(JWT::urlsafeB64Decode(explode('.', $token)[0]), true)['kid'] ?? null;
        if (self::$llaves === null || time() > self::$vencen || ($kid && ! isset(self::$llaves[$kid]))) {
            $jwks = Http::timeout(5)->get("{$issuer}/protocol/openid-connect/certs")->throw()->json();
            self::$llaves = JWK::parseKeySet($jwks, 'RS256');
            self::$vencen = time() + 600;
        }

        return self::$llaves;
    }
}
