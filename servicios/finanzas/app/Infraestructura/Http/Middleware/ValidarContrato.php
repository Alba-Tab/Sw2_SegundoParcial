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
 */
final class ValidarContrato
{
    private static ?ServerRequestValidator $validador = null;

    public function handle(Request $req, Closure $siguiente): Response
    {
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

    public static function contrato(): string
    {
        return config('servicio.contrato');
    }

    private static function validador(): ServerRequestValidator
    {
        return self::$validador ??= (new ValidatorBuilder)->fromYamlFile(self::contrato())->getServerRequestValidator();
    }
}
