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
    // Copia de contratos/openapi en la imagen (Dockerfile); valida las peticiones (ValidarContrato).
    'contrato' => env('OPENAPI_CONTRATO', base_path('contrato/finanzas.yaml')),
    // Vigencia de la cotización (spec 002): PT24H; en demo PT2M.
    'cotizacion_vigencia' => env('COTIZACION_VIGENCIA', 'PT24H'),
    // plataforma/semilla copiada en la imagen (D102): la carga semilla:cargar.
    'semilla' => env('SEMILLA_DIR', base_path('semilla')),
    // contratos/eventos y contratos/comun copiados en la imagen: el Outbox valida cada evento (000 §6).
    'eventos' => env('EVENTOS_CONTRATO', base_path('contrato')),
    // Enlace del correo de la factura (spec 006).
    'portal_url' => env('PORTAL_URL', 'http://localhost:5173'),
    'outbox' => ['intervalo_ms' => (int) env('OUTBOX_INTERVALO_MS', 1000), 'lote' => 100],
];
