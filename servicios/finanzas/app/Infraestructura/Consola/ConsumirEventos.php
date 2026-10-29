<?php

namespace App\Infraestructura\Consola;

use App\Aplicacion\Catalogo\AplicarCopias;
use App\Aplicacion\Saga\LiberarPorCancelacion;
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

    public function handle(ConexionAmqp $amqp, AplicarCopias $copias, LiberarPorCancelacion $cancelaciones): never
    {
        $this->registrarManejadores($copias, $cancelaciones);

        // Proceso largo: RoadRunner lo reinicia si termina (plugin service, D29).
        for (; ;) {
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

    /** tipo de evento => caso de uso. Los que no están aquí van a la DLQ. */
    public function registrarManejadores(AplicarCopias $copias, LiberarPorCancelacion $cancelaciones): void
    {
        $this->manejadores = [
            'ClienteActualizado' => $copias->clienteActualizado(...),
            'RutaActualizada' => $copias->rutaActualizada(...),
            'ViajeCancelado' => $cancelaciones->viajeCancelado(...),
        ];
    }

    private function procesar(AMQPMessage $mensaje): void
    {
        $sobre = json_decode($mensaje->getBody(), true);
        if (! is_array($sobre) || ! isset($this->manejadores[$sobre['tipo'] ?? ''])) {
            Log::warning('Evento sin manejador o inválido: va a la DLQ', ['tipo' => is_array($sobre) ? ($sobre['tipo'] ?? null) : null]);
            $mensaje->reject(false);

            return;
        }
        $this->aplicar($sobre);
        $mensaje->ack();
    }

    /**
     * Inbox (000 §6): el registro del eventId y el efecto van en la misma transacción.
     *
     * @param  array<string, mixed>  $sobre
     * @return bool true si el evento era nuevo y se aplicó
     */
    public function aplicar(array $sobre): bool
    {
        Context::add('correlationId', $sobre['correlationId'] ?? null);

        return DB::transaction(function () use ($sobre) {
            $nuevo = DB::table('inbox_eventos')->insertOrIgnore(['event_id' => $sobre['id'], 'tipo' => $sobre['tipo']]);
            if ($nuevo === 1) {
                ($this->manejadores[$sobre['tipo']])($sobre['datos']);
            }

            return $nuevo === 1;
        });
    }
}
