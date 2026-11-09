<?php

namespace App\Infraestructura\Http\Middleware;

use App\Infraestructura\Http\Problemas;
use Closure;
use Illuminate\Http\Request;
use League\OpenAPIValidation\PSR7\Exception\NoPath;
use League\OpenAPIValidation\PSR7\Exception\Validation\InvalidParameter;
use League\OpenAPIValidation\PSR7\Exception\Validation\RequiredParameterMissing;
use League\OpenAPIValidation\PSR7\Exception\ValidationFailed;
use League\OpenAPIValidation\PSR7\ServerRequestValidator;
use League\OpenAPIValidation\PSR7\ValidatorBuilder;
use League\OpenAPIValidation\Schema\Exception\SchemaMismatch;
use Nyholm\Psr7\Factory\Psr17Factory;
use Symfony\Bridge\PsrHttpMessage\Factory\PsrHttpFactory;
use Symfony\Component\HttpFoundation\Response;

/**
 * Contrato primero (§15.2): valida cada petición de /api/** contra contratos/openapi/finanzas.yaml antes del
 * controlador. Si no cumple, 400 VALIDACION con el campo. Una ruta que no está en el contrato sigue a la ruta (404).
 * El validador se arma una vez por worker de Octane. También exige el esquema `bearer` del contrato, que
 * Autenticacion ya garantizó antes.
 *
 * Antes del contrato rechaza lo que el validador no ve: un parámetro de consulta que no es UTF-8 válido y un número
 * del cuerpo que PHP vuelve infinito (`1e400`), que no se puede guardar ni volver a codificar en JSON.
 */
final class ValidarContrato
{
    private static ?ServerRequestValidator $validador = null;

    public function handle(Request $req, Closure $siguiente): Response
    {
        $error = self::consultaNoUtf8($req->query->all()) ?? self::numeroNoFinito($req->json()->all());
        if ($error !== null) {
            return Problemas::respuesta('VALIDACION', 'Petición inválida', 'La petición no cumple el contrato', 400, ['errores' => [$error]]);
        }
        $f = new Psr17Factory;
        $psr = (new PsrHttpFactory($f, $f, $f, $f))->createRequest($req);
        try {
            self::validador()->validate($psr);
        } catch (NoPath) {
            return $siguiente($req);
        } catch (ValidationFailed $e) {
            return Problemas::respuesta('VALIDACION', 'Petición inválida', 'La petición no cumple el contrato', 400,
                ['errores' => [self::error($e)]]);
        }

        return $siguiente($req);
    }

    /** @return array{campo: string, mensaje: string} */
    private static function error(ValidationFailed $e): array
    {
        // La excepción más interna dice qué parámetro o qué parte del cuerpo falló.
        $campo = '';
        $mensaje = $e->getMessage();
        for ($x = $e; $x !== null; $x = $x->getPrevious()) {
            if ($x instanceof InvalidParameter || $x instanceof RequiredParameterMissing) {
                $campo = $x->name();
            } elseif ($x instanceof SchemaMismatch && $campo === '') {
                $campo = implode('.', $x->dataBreadCrumb()?->buildChain() ?? []);
            }
            $mensaje = $x->getMessage();
        }
        // Un Monto ({monto, moneda}) es un solo campo para el cliente: "monto.monto" es "monto" (spec 008, FF4).
        $campo = preg_replace('/\.(monto|moneda)$/', '', $campo) ?? $campo;

        return ['campo' => $campo, 'mensaje' => $mensaje];
    }

    /**
     * @param  array<mixed>  $consulta
     * @return array{campo: string, mensaje: string}|null
     */
    private static function consultaNoUtf8(array $consulta, string $prefijo = ''): ?array
    {
        foreach ($consulta as $nombre => $valor) {
            $campo = $prefijo === '' ? (string) $nombre : $prefijo.'.'.$nombre;
            if (! mb_check_encoding((string) $nombre, 'UTF-8') || (is_string($valor) && ! mb_check_encoding($valor, 'UTF-8'))) {
                return ['campo' => $campo, 'mensaje' => 'No es texto UTF-8 válido'];
            }
            if (is_array($valor) && ($error = self::consultaNoUtf8($valor, $campo)) !== null) {
                return $error;
            }
        }

        return null;
    }

    /** @return array{campo: string, mensaje: string}|null */
    private static function numeroNoFinito(mixed $valor, string $campo = ''): ?array
    {
        if (is_float($valor) && ! is_finite($valor)) {
            return ['campo' => $campo, 'mensaje' => 'El número está fuera de rango'];
        }
        foreach (is_array($valor) ? $valor : [] as $nombre => $x) {
            if (($error = self::numeroNoFinito($x, $campo === '' ? (string) $nombre : $campo.'.'.$nombre)) !== null) {
                return $error;
            }
        }

        return null;
    }

    public static function contrato(): string
    {
        return config('servicio.contrato');
    }

    private static function validador(): ServerRequestValidator
    {
        return self::$validador ??= (new ValidatorBuilder)->fromYamlFile(self::contrato())->getServerRequestValidator();
    }
}
