<?php

use App\Dominio\Comun\ErrorDeDominio;
use App\Infraestructura\Http\Middleware\Correlacion;
use App\Infraestructura\Http\Problemas;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Psr\Log\LogLevel;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        apiPrefix: '',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withCommands([__DIR__.'/../app/Infraestructura/Consola'])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(Correlacion::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Una regla de negocio rota (CREDITO_INSUFICIENTE, PAGO_DUPLICADO…) es una respuesta normal, no un error del
        // servicio: queda en el log como INFO.
        $exceptions->level(ErrorDeDominio::class, LogLevel::INFO);
        // Servicio solo de API: todo error sale como application/problem+json (000 §5).
        $exceptions->render(fn (Throwable $e) => Problemas::desde($e));
    })->create();
