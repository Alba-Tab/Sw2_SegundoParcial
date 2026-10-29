<?php

namespace App\Infraestructura\Log;

use Monolog\Formatter\FormatterInterface;
use Monolog\LogRecord;

/** Logs JSON de una línea con los campos de 000 §10: timestamp, nivel, servicio, correlationId, traceId, mensaje. */
final class FormatoJson implements FormatterInterface
{
    public function format(LogRecord $r): string
    {
        $linea = [
            'timestamp' => $r->datetime->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z'),
            'nivel' => $r->level->getName(),
            'servicio' => 'finanzas',
            'correlationId' => $r->extra['correlationId'] ?? $r->context['correlationId'] ?? null,
            'traceId' => $r->extra['traceId'] ?? null,
            'mensaje' => $r->message,
        ];
        $resto = array_diff_key($r->context, ['correlationId' => 1]);
        if ($resto !== []) {
            $linea['datos'] = $resto;
        }

        return json_encode($linea, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR)."\n";
    }

    public function formatBatch(array $records): string
    {
        return implode('', array_map($this->format(...), $records));
    }
}
