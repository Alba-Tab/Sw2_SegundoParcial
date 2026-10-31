<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Puertos\VersionDesactualizada;
use App\Dominio\Comun\ErrorDeDominio;
use App\Infraestructura\Persistencia\FallaTransitoria;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Context;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/** Problem Details (RFC 9457) con `codigo` y `correlationId` (000 §5). Nunca trazas de pila ni mensajes de la base. */
final class Problemas
{
    /** Estado HTTP de cada código de 000 §5 (los que usa Finanzas). */
    private const ESTADOS = [
        'VALIDACION' => 400, 'NO_AUTENTICADO' => 401, 'SIN_PERMISO' => 403, 'COTIZACION_AJENA' => 403,
        'NO_ENCONTRADO' => 404, 'CONFLICTO_ESTADO' => 409, 'VERSION_DESACTUALIZADA' => 409,
        'IDEMPOTENCIA_EN_PROCESO' => 409, 'PAGO_DUPLICADO' => 409, 'IDEMPOTENCIA_CUERPO_DISTINTO' => 422,
        'COTIZACION_VENCIDA' => 422, 'CREDITO_INSUFICIENTE' => 422, 'CREDITO_RECHAZADO' => 422,
        'APROBACION_VENCIDA' => 422, 'PAGO_EXCEDE_SALDO' => 422, 'TONELAJE_EXCEDIDO' => 422,
        'CLIENTE_NO_REPLICADO' => 503, 'DEPENDENCIA_NO_DISPONIBLE' => 503, 'ERROR_INTERNO' => 500,
    ];

    /** Código de una excepción HTTP del framework (ruta inexistente, cuerpo demasiado grande…) según su estado. */
    private const POR_ESTADO = [400 => 'VALIDACION', 401 => 'NO_AUTENTICADO', 403 => 'SIN_PERMISO', 404 => 'NO_ENCONTRADO',
        405 => 'NO_ENCONTRADO', 409 => 'CONFLICTO_ESTADO', 413 => 'VALIDACION', 429 => 'LIMITE_PETICIONES',
        503 => 'DEPENDENCIA_NO_DISPONIBLE'];

    /** `title` para personas según el estado HTTP (000 §5), como Problemas.titulo de Viajes; el código va en `codigo`. */
    private const TITULOS = [
        400 => 'Petición inválida', 401 => 'No autenticado', 403 => 'Sin permiso', 404 => 'No encontrado',
        405 => 'Método no permitido', 409 => 'Conflicto con el estado actual', 413 => 'Petición demasiado grande',
        422 => 'Regla de negocio no cumplida', 429 => 'Demasiadas peticiones', 500 => 'Error interno',
        503 => 'Dependencia no disponible',
    ];

    /**
     * @param  array<string, mixed>  $extra  campos adicionales del Problem Details (por ejemplo `errores`)
     * @param  array<string, string>  $encabezados
     */
    public static function respuesta(string $codigo, string $titulo, string $detalle, ?int $estado = null, array $extra = [], array $encabezados = []): JsonResponse
    {
        $estado ??= self::ESTADOS[$codigo] ?? 422;
        $p = [
            'type' => 'https://transporte.local/errores/'.strtolower(str_replace('_', '-', $codigo)),
            'title' => $titulo,
            'status' => $estado,
            'detail' => $detalle,
            'codigo' => $codigo,
        ] + array_filter(['correlationId' => Context::get('correlationId')]) + $extra;

        // Un valor recibido que no es UTF-8 válido (y que el detalle repite) sale con U+FFFD en vez de romper el JSON.
        return new JsonResponse($p, $estado, ['Content-Type' => 'application/problem+json'] + $encabezados, JSON_INVALID_UTF8_SUBSTITUTE);
    }

    public static function titulo(int $estado): string
    {
        return self::TITULOS[$estado] ?? ($estado >= 500 ? 'Error interno' : 'Petición rechazada');
    }

    public static function desde(\Throwable $e): JsonResponse
    {
        return match (true) {
            $e instanceof ErrorDeDominio => self::respuesta($e->codigo, self::titulo(self::ESTADOS[$e->codigo] ?? 422), $e->getMessage(),
                null, self::extensiones($e),
                (self::ESTADOS[$e->codigo] ?? 422) === 503 ? ['Retry-After' => $e->codigo === 'CLIENTE_NO_REPLICADO' ? '2' : '10'] : []),
            $e instanceof ValidationException => self::respuesta('VALIDACION', 'Petición inválida', 'Revisa los campos indicados', 400,
                ['errores' => collect($e->errors())->flatMap(fn ($m, $c) => array_map(fn ($x) => ['campo' => $c, 'mensaje' => $x], $m))->values()->all()]),
            $e instanceof AuthenticationException => self::respuesta('NO_AUTENTICADO', 'No autenticado', $e->getMessage(), 401),
            // Idempotencia ya repitió la transacción 3 veces (spec 008).
            $e instanceof VersionDesactualizada => self::respuesta('VERSION_DESACTUALIZADA', 'Versión desactualizada',
                'Otro cambio modificó los mismos datos; vuelve a intentarlo', 409),
            $e instanceof HttpExceptionInterface => self::http($e),
            // PostgreSQL caído, reiniciándose o en interbloqueo: la petición se puede repetir.
            FallaTransitoria::es($e) => self::respuesta('DEPENDENCIA_NO_DISPONIBLE', 'Dependencia no disponible',
                'La base de datos no responde; intenta de nuevo en unos segundos', 503, [], ['Retry-After' => '5']),
            // Error inesperado: 500 ERROR_INTERNO (000 §5); la traza queda en el log, nunca en la respuesta.
            default => self::respuesta('ERROR_INTERNO', 'Error interno', 'Ocurrió un error inesperado', 500),
        };
    }

    /**
     * Excepción HTTP del framework. 413 es el cuerpo que pasa `post_max_size` (ValidatePostSize): VALIDACION, con el
     * detalle en español. Un estado sin código propio cae en VALIDACION (4xx) o ERROR_INTERNO (5xx).
     */
    private static function http(HttpExceptionInterface $e): JsonResponse
    {
        $estado = $e->getStatusCode();
        $codigo = self::POR_ESTADO[$estado] ?? ($estado >= 500 ? 'ERROR_INTERNO' : 'VALIDACION');
        $detalle = $estado === 413 ? 'El cuerpo de la petición pasa el tamaño máximo permitido' : ($e->getMessage() ?: self::titulo($estado));

        return self::respuesta($codigo, self::titulo($estado), $detalle, $estado, [], $e->getHeaders());
    }

    /**
     * `datos` del error como extensiones del Problem Details; `campo` se convierte en `errores` (000 §5).
     *
     * @return array<string, mixed>
     */
    private static function extensiones(ErrorDeDominio $e): array
    {
        $extra = $e->datos;
        if (isset($extra['campo'])) {
            $extra['errores'] = [['campo' => $extra['campo'], 'mensaje' => $e->getMessage()]];
            unset($extra['campo']);
        }

        return $extra;
    }
}
