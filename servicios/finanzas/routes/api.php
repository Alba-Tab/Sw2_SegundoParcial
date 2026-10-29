<?php

use App\Infraestructura\Http\CotizacionesController;
use App\Infraestructura\Http\LineasCreditoController;
use App\Infraestructura\Http\Middleware\Autenticacion;
use App\Infraestructura\Http\Middleware\ValidarContrato;
use App\Infraestructura\Http\SaludController;
use App\Infraestructura\Http\SolicitudesAprobacionController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [SaludController::class, 'vivo']);
Route::get('/health/ready', [SaludController::class, 'listo']);

// Rutas de negocio de contratos/openapi/finanzas.yaml.
Route::prefix('api')->middleware([Autenticacion::class, ValidarContrato::class])->group(function () {
    Route::post('v1/cotizaciones', [CotizacionesController::class, 'crear']);
    Route::get('v1/cotizaciones', [CotizacionesController::class, 'listar']);
    Route::get('v1/cotizaciones/{cotizacionId}', [CotizacionesController::class, 'obtener']);
    Route::get('v1/lineas-credito/mia', [LineasCreditoController::class, 'mia']);
    Route::get('v1/lineas-credito/{clienteId}', [LineasCreditoController::class, 'deCliente']);
    Route::get('v1/solicitudes-aprobacion', [SolicitudesAprobacionController::class, 'listar']);
    Route::get('v1/solicitudes-aprobacion/{servicioId}', [SolicitudesAprobacionController::class, 'obtener']);

    // Una ruta inexistente bajo /api pasa primero por la autenticación: 401/503 antes que 404, como en Viajes y Flota.
    Route::any('{ruta}', fn () => abort(404, 'El recurso no existe'))->where('ruta', '.*');
});
