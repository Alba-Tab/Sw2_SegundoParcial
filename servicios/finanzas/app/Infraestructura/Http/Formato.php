<?php

namespace App\Infraestructura\Http;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Cotizacion\Cotizacion;
use App\Dominio\Credito\LineaCredito;

/** Representaciones JSON de contratos/openapi/finanzas.yaml. */
final class Formato
{
    public static function instante(\DateTimeImmutable $t): string
    {
        return $t->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    public static function numero(string $decimal): int|float
    {
        return str_contains($decimal, '.') ? (float) $decimal : (int) $decimal;
    }

    /** @return array<string, mixed> */
    public static function cotizacion(Cotizacion $c, \DateTimeImmutable $ahora): array
    {
        return [
            'cotizacionId' => $c->id,
            'clienteId' => $c->clienteId,
            'rutaId' => $c->rutaId,
            'tipoCarga' => $c->tipoCarga->value,
            'toneladas' => self::numero($c->toneladas),
            'fechaViaje' => $c->fechaViaje,
            'tarifaPorTonelada' => $c->tarifaPorTonelada->aContrato(),
            'monto' => $c->monto->aContrato(),
            'estado' => $c->estado(),
            'vencida' => $c->vencida($ahora),
            'venceEn' => self::instante($c->venceEn),
            'canal' => $c->canal,
            'creadaEn' => self::instante($c->creadaEn),
        ];
    }

    /** @return array<string, mixed> */
    public static function linea(LineaCredito $l, bool $enMora): array
    {
        return [
            'clienteId' => $l->clienteId,
            'limite' => $l->limite->aContrato(),
            'reservado' => $l->reservado->aContrato(),
            'utilizado' => $l->utilizado->aContrato(),
            'disponible' => $l->disponible()->aContrato(),
            'enMora' => $enMora,
            'version' => $l->version,
        ];
    }

    public static function aCursor(string $ultimo): string
    {
        return rtrim(strtr(base64_encode($ultimo), '+/', '-_'), '=');
    }

    public static function desdeCursor(?string $cursor): ?string
    {
        if ($cursor === null || $cursor === '') {
            return null;
        }
        $id = base64_decode(strtr($cursor, '-_', '+/'), true);
        if ($id === false || ! preg_match('/^[0-9a-f-]{36}$/', $id)) {
            throw new ErrorDeDominio('VALIDACION', 'cursor: valor inválido');
        }

        return $id;
    }
}
