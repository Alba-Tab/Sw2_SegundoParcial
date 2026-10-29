<?php

namespace App\Infraestructura\Mensajeria;

use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Connection\AMQPStreamConnection;

/** Conexión y canal con confirmaciones (publisher confirms), creados al primer uso y recreados si se caen. */
final class ConexionAmqp
{
    private ?AMQPStreamConnection $conexion = null;

    private ?AMQPChannel $canal = null;

    public function canal(): AMQPChannel
    {
        if ($this->canal?->is_open() && $this->conexion?->isConnected()) {
            return $this->canal;
        }
        $c = config('servicio.amqp');
        $this->conexion = new AMQPStreamConnection($c['host'], $c['puerto'], $c['usuario'], $c['clave'],
            connection_timeout: 5.0, read_write_timeout: 30.0, heartbeat: 15);
        $this->canal = $this->conexion->channel();
        $this->canal->confirm_select();
        // Un nack del broker revierte la transacción del relay en lugar de marcar la fila como publicada.
        $this->canal->set_nack_handler(fn () => throw new \RuntimeException('El broker rechazó la publicación'));

        return $this->canal;
    }

    public function disponible(): bool
    {
        try {
            return $this->canal()->is_open();
        } catch (\Throwable) {
            $this->cerrar();

            return false;
        }
    }

    public function cerrar(): void
    {
        try {
            $this->canal?->close();
            $this->conexion?->close();
        } catch (\Throwable) {
        }
        $this->canal = null;
        $this->conexion = null;
    }
}
