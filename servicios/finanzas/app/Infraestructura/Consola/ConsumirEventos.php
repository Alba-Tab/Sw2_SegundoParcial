<?php

namespace App\Infraestructura\Consola;

use App\Infraestructura\Mensajeria\ConexionAmqp;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PhpAmqpLib\Message\AMQPMessage;

/**
 * Consumidor de finanzas.eventos como proceso largo del plugin service de RoadRunner (D29). Inbox: el efecto y el
 * registro en inbox_eventos van en la misma transacción, así un evento repetido no se aplica dos veces (FC2).
 * Los manejadores por tipo llegan con cada flujo (F4 y F5); un tipo sin manejador va a la DLQ, no se pierde.
 */
final class ConsumirEventos extends Command
{
    protected $signature = 'eventos:consumir';

    protected $description = 'Consume finanzas.eventos con Inbox';

    /** @var array<string, callable(array<string, mixed>): void> tipo => manejador */
    private array $manejadores = [];

    public function handle(ConexionAmqp $amqp): never
    {
        // Proceso largo: RoadRunner lo reinicia si termina (plugin service, D29).
        for (;;) {
            try {
                $canal = $amqp->canal();
                $canal->basic_qos(0, 10, false);
                $canal->basic_consume('finanzas.eventos', 'finanzas', false, false, false, false, fn (AMQPMessage $m) => $this->procesar($m));
                Log::info('eventos:consumir escuchando finanzas.eventos');
                $canal->consume();
            } catch (\Throwable $e) {
                Log::warning('eventos:consumir sin conexión, reintenta en 5 s', ['error' => $e->getMessage()]);
                $amqp->cerrar();
                sleep(5);
            }
        }
    }

    private function procesar(AMQPMessage $mensaje): void
    {
        $sobre = json_decode($mensaje->getBody(), true);
        $manejador = is_array($sobre) ? ($this->manejadores[$sobre['tipo'] ?? ''] ?? null) : null;
        if ($manejador === null) {
            Log::warning('Evento sin manejador o inválido: va a la DLQ', ['tipo' => $sobre['tipo'] ?? null]);
            $mensaje->reject(false);

            return;
        }
        Context::add('correlationId', $sobre['correlationId'] ?? null);
        DB::transaction(function () use ($sobre, $manejador) {
            $nuevo = DB::table('inbox_eventos')->insertOrIgnore(['event_id' => $sobre['id'], 'tipo' => $sobre['tipo']]);
            if ($nuevo === 1) {
                $manejador($sobre['datos']);
            }
        });
        $mensaje->ack();
    }
}
