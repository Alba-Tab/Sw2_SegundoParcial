<?php

namespace App\Infraestructura\Consola;

use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Mensajeria\RelayOutbox;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Relay del Outbox como proceso largo del plugin service de RoadRunner (D29). */
final class PublicarOutbox extends Command
{
    protected $signature = 'outbox:publicar {--una-vez : publica lo pendiente y termina}';

    protected $description = 'Publica outbox_eventos en RabbitMQ con confirmación del broker';

    public function handle(RelayOutbox $relay, ConexionAmqp $amqp): int
    {
        do {
            try {
                $n = $relay->publicarPendientes();
                if ($n > 0) {
                    Log::info("Outbox: {$n} eventos publicados");
                }
            } catch (\Throwable $e) {
                Log::warning('Outbox: se reintenta en la siguiente vuelta', ['error' => $e->getMessage()]);
                $amqp->cerrar();
                DB::disconnect();
            }
            if ($this->option('una-vez')) {
                return self::SUCCESS;
            }
            usleep(config('servicio.outbox.intervalo_ms') * 1000);
        } while (true);
    }
}
