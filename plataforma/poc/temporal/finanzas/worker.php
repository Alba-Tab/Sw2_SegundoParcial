<?php
// Worker de la cola `finanzas`: arranca Laravel una vez y registra las actividades Finanzas.* en RoadRunner.
declare(strict_types=1);

use App\Temporal\FinanzasActividades;
use Illuminate\Contracts\Console\Kernel;
use Temporal\WorkerFactory;

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$factory = WorkerFactory::create();
$worker = $factory->newWorker('finanzas');
$worker->registerActivity(FinanzasActividades::class, fn () => $app->make(FinanzasActividades::class));
$factory->run();
