<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Simula el relay del Outbox: cada 5 s consulta la base (prueba la reconexión de Laravel en un proceso largo). */
class PublicarOutbox extends Command
{
    protected $signature = 'outbox:publicar';

    public function handle(): int
    {
        $this->info('outbox:publicar iniciado pid=' . getmypid());
        while (true) {
            try {
                $n = DB::table('reservas_credito')->count();
                $this->line("outbox:publicar ok reservas={$n}");
            } catch (\Throwable $e) {
                $this->error('outbox:publicar sin base: ' . $e->getMessage());
            }
            sleep(5);
        }
    }
}
