<?php

// CORS solo para /api (CORS_ORIGENES separados por coma).
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ORIGENES', ''))))),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Correlation-Id', 'traceparent'],
    'exposed_headers' => ['Location', 'Retry-After', 'X-Correlation-Id'],
    'max_age' => 600,
    'supports_credentials' => false,
];
