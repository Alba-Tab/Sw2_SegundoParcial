<?php

// Todo lo que cambia entre local y nube viene del entorno (000 §11). Valores locales en .env.example.
return [
    'nombre' => 'finanzas',
    'oidc_issuer' => rtrim((string) env('OIDC_ISSUER', ''), '/'),
    'audiencia' => 'finanzas',
    'amqp' => [
        'host' => env('AMQP_HOST', 'localhost'),
        'puerto' => (int) env('AMQP_PORT', 5672),
        'usuario' => env('AMQP_USUARIO', 'finanzas'),
        'clave' => env('AMQP_CLAVE', 'finanzas'),
    ],
    'outbox' => ['intervalo_ms' => (int) env('OUTBOX_INTERVALO_MS', 1000), 'lote' => 100],
];
