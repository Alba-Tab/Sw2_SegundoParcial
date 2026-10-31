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

    /**
     * Literal de un número de primer nivel del cuerpo JSON tal como llegó ("1E1", "20.10"), o null si el campo no es un
     * número. Cada número que no está dentro de un texto se vuelve texto antes de decodificar: json_decode no lo
     * redondea ni le cambia la forma. Los textos (y las llaves con escapes) quedan como estaban.
     */
    public static function numeroCrudo(string $cuerpo, string $campo): ?string
    {
        $comoTexto = preg_replace_callback('/"(?:[^"\\\\]++|\\\\.)*+"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/s',
            fn (array $m) => $m[0][0] === '"' ? $m[0] : '"'.$m[0].'"', $cuerpo);
        $datos = $comoTexto === null ? null : json_decode($comoTexto, true);
        $valor = is_array($datos) ? ($datos[$campo] ?? null) : null;

        return is_string($valor) ? $valor : null;
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
