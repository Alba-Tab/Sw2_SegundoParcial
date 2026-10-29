<?php

namespace App\Aplicacion\Credito;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\EvaluadorMora;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Credito\LineaCredito;

/** Línea de crédito del cliente del token o, para administración, comercial y gerente, de cualquier cliente. */
final class ConsultarLineaCredito
{
    public function __construct(private readonly LineaCreditoRepositorio $lineas, private readonly EvaluadorMora $mora) {}

    /** @return array{linea: LineaCredito, enMora: bool} */
    public function mia(Solicitante $quien): array
    {
        $clienteId = $quien->tiene('cliente') && $quien->clienteId ? $quien->clienteId : throw new ErrorDeDominio('SIN_PERMISO', 'Solo un cliente tiene línea propia');

        return $this->de($clienteId);
    }

    /** @return array{linea: LineaCredito, enMora: bool} */
    public function deCliente(Solicitante $quien, string $clienteId): array
    {
        if (! $quien->tieneAlguno(['administracion', 'comercial', 'gerente'])) {
            throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver líneas de crédito');
        }

        return $this->de($clienteId);
    }

    /** @return array{linea: LineaCredito, enMora: bool} */
    private function de(string $clienteId): array
    {
        $linea = $this->lineas->porCliente($clienteId) ?? throw new ErrorDeDominio('NO_ENCONTRADO', 'El cliente no tiene línea de crédito');

        return ['linea' => $linea, 'enMora' => $this->mora->enMora($clienteId)];
    }
}
