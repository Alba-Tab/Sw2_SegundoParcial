<?php

namespace App\Infraestructura\Http;

use App\Dominio\Comun\ErrorDeDominio;
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
        'CLIENTE_NO_REPLICADO' => 503, 'DEPENDENCIA_NO_DISPONIBLE' => 503,
    ];

    private const POR_ESTADO = [400 => 'VALIDACION', 401 => 'NO_AUTENTICADO', 403 => 'SIN_PERMISO', 404 => 'NO_ENCONTRADO', 405 => 'NO_ENCONTRADO'];

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

        return new JsonResponse($p, $estado, ['Content-Type' => 'application/problem+json'] + $encabezados);
    }

    public static function desde(\Throwable $e): JsonResponse
    {
        return match (true) {
            $e instanceof ErrorDeDominio => self::respuesta($e->codigo, $e->codigo, $e->getMessage()),
            $e instanceof ValidationException => self::respuesta('VALIDACION', 'Petición inválida', 'Revisa los campos indicados', 400,
                ['errores' => collect($e->errors())->flatMap(fn ($m, $c) => array_map(fn ($x) => ['campo' => $c, 'mensaje' => $x], $m))->values()->all()]),
            $e instanceof AuthenticationException => self::respuesta('NO_AUTENTICADO', 'No autenticado', $e->getMessage(), 401),
            $e instanceof HttpExceptionInterface => self::respuesta(self::POR_ESTADO[$e->getStatusCode()] ?? 'CONFLICTO_ESTADO',
                'Error', $e->getMessage() ?: 'Error', $e->getStatusCode(), [], $e->getHeaders()),
            default => self::respuesta('DEPENDENCIA_NO_DISPONIBLE', 'Error interno', 'Ocurrió un error inesperado', 500),
        };
    }
}
