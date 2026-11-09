<?php

namespace App\Aplicacion\Catalogo;

use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Dominio\Credito\LineaCredito;

/**
 * Consumidor de ClienteActualizado y RutaActualizada (specs 001 y 002). Descarta versiones viejas (000 §6). Con el
 * primer ClienteActualizado de un cliente crea su línea de 30.000,00 BOB (D01); los siguientes solo actualizan la copia.
 * Corre dentro de la transacción del Inbox.
 */
final class AplicarCopias
{
    public function __construct(private readonly CatalogoRepositorio $catalogo, private readonly LineaCreditoRepositorio $lineas) {}

    /** @param array<string, mixed> $datos */
    public function clienteActualizado(array $datos): void
    {
        $r = $this->catalogo->aplicarCliente($datos);
        if ($r['nuevo'] && $this->lineas->porCliente($datos['clienteId']) === null) {
            $this->lineas->crear(LineaCredito::porDefecto($datos['clienteId']));
        }
    }

    /** @param array<string, mixed> $datos */
    public function rutaActualizada(array $datos): void
    {
        $this->catalogo->aplicarRuta($datos);
    }
}
