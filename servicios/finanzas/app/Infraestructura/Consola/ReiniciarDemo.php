<?php

namespace App\Infraestructura\Consola;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * `php artisan demo:reiniciar` (T8.8, D102): vacía todas las tablas de Finanzas (Outbox, Inbox, idempotencia,
 * cotizaciones, reservas, facturas, pagos…) menos la de migraciones y vuelve a cargar la semilla. Un comando, nunca un
 * endpoint; reiniciar-demo.sh lo corre con los relays y consumidores detenidos.
 */
final class ReiniciarDemo extends Command
{
    protected $signature = 'demo:reiniciar';

    protected $description = 'Vacía la base de Finanzas y vuelve a cargar la semilla de demo';

    public function handle(): int
    {
        $tablas = array_column(
            DB::select("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'"),
            'tablename',
        );
        DB::statement('TRUNCATE '.implode(', ', $tablas).' RESTART IDENTITY');
        $this->info('Finanzas: '.count($tablas).' tablas vaciadas');

        return $this->call('semilla:cargar');
    }
}
