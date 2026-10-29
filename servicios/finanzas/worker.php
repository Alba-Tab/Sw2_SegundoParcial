<?php

// Worker de la cola `finanzas` de Temporal (D29): arranca Laravel una vez y registra las actividades Finanzas.*
// (contratos/temporal/programar-viaje.md). Cada tarea pide una instancia nueva al contenedor.
declare(strict_types=1);

use App\Infraestructura\Temporal\FinanzasActividades;
use Illuminate\Contracts\Console\Kernel;
use Temporal\WorkerFactory;

require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$factory = WorkerFactory::create();
$worker = $factory->newWorker('finanzas');
$worker->registerActivity(FinanzasActividades::class, fn () => $app->make(FinanzasActividades::class));
$factory->run();
