<?php

// Worker de la cola `finanzas` de Temporal (D29): arranca Laravel una vez y registra las actividades Finanzas.*.
// Las actividades (contratos/temporal/) entran en F4 (T4.4); hasta entonces el worker solo se conecta.
declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Temporal\WorkerFactory;

require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$factory = WorkerFactory::create();
$factory->newWorker('finanzas');
$factory->run();
