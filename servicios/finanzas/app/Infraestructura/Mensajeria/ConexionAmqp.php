<?php

namespace App\Infraestructura\Mensajeria;

use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Connection\AbstractConnection;
use PhpAmqpLib\Connection\AMQPConnectionConfig;
use PhpAmqpLib\Connection\AMQPConnectionFactory;
use PhpAmqpLib\Connection\AMQPStreamConnection;

/** Conexión y canal con confirmaciones (publisher confirms), creados al primer uso y recreados si se caen. */
final class ConexionAmqp
{
    private ?AbstractConnection $conexion = null;

    private ?AMQPChannel $canal = null;

    public function canal(): AMQPChannel
    {
        if ($this->canal?->is_open() && $this->conexion?->isConnected()) {
            return $this->canal;
        }
        $c = config('servicio.amqp');
        $tls = self::configuracionTls($c);
        $this->conexion = $tls !== null ? AMQPConnectionFactory::create($tls)
            : new AMQPStreamConnection($c['host'], $c['puerto'], $c['usuario'], $c['clave'],
                connection_timeout: 5.0, read_write_timeout: 30.0, heartbeat: 15);
        $this->canal = $this->conexion->channel();
        $this->canal->confirm_select();
        // Un nack del broker revierte la transacción del relay en lugar de marcar la fila como publicada.
        $this->canal->set_nack_handler(fn () => throw new \RuntimeException('El broker rechazó la publicación'));

        return $this->canal;
    }

    /**
     * AMQPS (B2): con AMQP_CA, TLS que verifica el certificado y el nombre del broker contra la CA propia, con los mismos
     * plazos que la conexión sin TLS. Sin AMQP_CA, null y la conexión va en claro como hoy.
     *
     * @param  array{host: string, puerto: int, usuario: string, clave: string, ca: string}  $c
     */
    public static function configuracionTls(array $c): ?AMQPConnectionConfig
    {
        if ($c['ca'] === '') {
            return null;
        }
        $config = new AMQPConnectionConfig;
        $config->setHost($c['host']);
        $config->setPort($c['puerto']);
        $config->setUser($c['usuario']);
        $config->setPassword($c['clave']);
        $config->setConnectionTimeout(5.0);
        $config->setReadTimeout(30.0);
        $config->setWriteTimeout(30.0);
        $config->setHeartbeat(15);
        $config->setIsSecure(true);
        $config->setSslCaCert($c['ca']);
        $config->setSslVerify(true);
        $config->setSslVerifyName(true);

        return $config;
    }

    /**
     * php-amqplib solo manda heartbeats cuando lee o escribe: un relay sin nada que publicar perdería la conexión a los
     * 30 s. Se llama en cada vuelta; si la conexión ya no sirve, se descarta y la siguiente publicación abre otra.
     */
    public function latido(): void
    {
        if ($this->conexion === null) {
            return;
        }
        try {
            $this->conexion->checkHeartBeat();
        } catch (\Throwable) {
            $this->cerrar();
        }
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
