<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/** Simula el consumidor de RabbitMQ: proceso largo bajo el plugin service. Termina solo si existe /tmp/matar-eventos. */
class ConsumirEventos extends Command
{
    protected $signature = 'eventos:consumir';

    public function handle(): int
    {
        $this->info('eventos:consumir iniciado pid=' . getmypid());
        while (true) {
            if (file_exists('/tmp/matar-eventos')) {
                @unlink('/tmp/matar-eventos');
                $this->error('eventos:consumir termina con error (simulado)');
                return 1;
            }
            sleep(1);
        }
    }
}
