<?php

namespace App\Infraestructura\Http\Middleware;

use App\Infraestructura\Http\Problemas;
use Closure;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * /api/** exige un JWT de Keycloak con emisor OIDC_ISSUER y audiencia "finanzas" (000 §8). Las llaves se bajan en la
 * primera petición y se guardan en memoria del worker de Octane 10 min (o hasta ver un `kid` nuevo), así Finanzas
 * arranca sin Keycloak. P10: sin OIDC_ISSUER, /api/** responde 503 DEPENDENCIA_NO_DISPONIBLE.
 *
 * - Si Keycloak no responde y no hay llaves guardadas que sirvan para el token: 503 (no 401), y no se vuelve a
 *   intentar durante 10 s.
 * - Un `kid` que no está ni después de volver a bajar las llaves se recuerda 60 s: un token con un `kid` inventado no
 *   hace una descarga por petición.
 */
final class Autenticacion
{
    private const VIGENCIA = 600;

    private const ESPERA_KID_DESCONOCIDO = 60;

    private const ESPERA_TRAS_FALLA = 10;

    private const MAXIMO_KIDS_DESCONOCIDOS = 100;

    /** @var array<string, Key>|null */
    private static ?array $llaves = null;

    private static int $vencen = 0;

    /** Hasta cuándo no se vuelve a pedir el JWKS después de una falla. */
    private static int $reintentarDesde = 0;

    /** @var array<string, int> kid desconocido => hasta cuándo no provoca otra descarga */
    private static array $kidsDesconocidos = [];

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
        $llaves = $this->llaves($issuer, self::kid($token));
        if ($llaves === null) {
            return Problemas::respuesta('DEPENDENCIA_NO_DISPONIBLE', 'Identidad no disponible',
                'No se pudieron obtener las llaves de Keycloak para validar el token', 503, [], ['Retry-After' => (string) self::ESPERA_TRAS_FALLA]);
        }
        try {
            $claims = JWT::decode($token, $llaves);
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

    /**
     * Las llaves con las que validar el token, o null si Keycloak no respondió y las guardadas no sirven.
     *
     * @return array<string, Key>|null
     */
    private function llaves(string $issuer, ?string $kid): ?array
    {
        $ahora = time();
        $vencidas = self::$llaves === null || $ahora > self::$vencen;
        $kidNuevo = $kid !== null && ! isset(self::$llaves[$kid]);
        $yaBuscado = $kid !== null && (self::$kidsDesconocidos[$kid] ?? 0) > $ahora;
        if (! $vencidas && (! $kidNuevo || $yaBuscado)) {
            return self::$llaves;
        }
        if ($ahora < self::$reintentarDesde || ! $this->descargar($issuer, $ahora)) {
            // Keycloak no responde: sirven las llaves que ya había, si el token es de una de ellas.
            return self::$llaves !== null && ($kid === null || isset(self::$llaves[$kid])) ? self::$llaves : null;
        }
        if ($kid !== null && ! isset(self::$llaves[$kid])) {
            if (count(self::$kidsDesconocidos) >= self::MAXIMO_KIDS_DESCONOCIDOS) {
                self::$kidsDesconocidos = [];
            }
            self::$kidsDesconocidos[$kid] = $ahora + self::ESPERA_KID_DESCONOCIDO;
        }

        return self::$llaves;
    }

    private function descargar(string $issuer, int $ahora): bool
    {
        try {
            $jwks = Http::timeout(5)->get("{$issuer}/protocol/openid-connect/certs")->throw()->json();
            self::$llaves = JWK::parseKeySet(is_array($jwks) ? $jwks : [], 'RS256');
            self::$vencen = $ahora + self::VIGENCIA;

            return true;
        } catch (\Throwable $e) {
            Log::warning('No se pudieron bajar las llaves de Keycloak', ['error' => $e->getMessage()]);
            self::$reintentarDesde = $ahora + self::ESPERA_TRAS_FALLA;

            return false;
        }
    }

    /** `kid` de la cabecera del JWT sin validarlo todavía; null si la cabecera no se puede leer. */
    private static function kid(string $token): ?string
    {
        $cabecera = json_decode((string) base64_decode(strtr(explode('.', $token)[0], '-_', '+/'), true), true);

        return is_array($cabecera) && is_string($cabecera['kid'] ?? null) ? $cabecera['kid'] : null;
    }

    /** Olvida llaves y fallas guardadas (pruebas). */
    public static function reiniciar(): void
    {
        self::$llaves = null;
        self::$vencen = 0;
        self::$reintentarDesde = 0;
        self::$kidsDesconocidos = [];
    }
}
