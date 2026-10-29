<?php

namespace App\Aplicacion\Cotizacion;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Cotizacion\Cotizacion;

/** Lecturas de cotizaciones: el cliente solo las suyas; administración, comercial y gerente las de cualquiera. */
final class ConsultarCotizaciones
{
    private const VEN_TODAS = ['administracion', 'comercial', 'gerente', 'despachador'];

    public function __construct(private readonly CotizacionRepositorio $cotizaciones) {}

    public function obtener(Solicitante $quien, string $id): Cotizacion
    {
        $c = $this->cotizaciones->porId($id) ?? throw new ErrorDeDominio('NO_ENCONTRADO', 'La cotización no existe');
        if (! $quien->tieneAlguno(self::VEN_TODAS) && $c->clienteId !== $quien->clienteId) {
            throw new ErrorDeDominio('SIN_PERMISO', 'La cotización es de otro cliente');
        }

        return $c;
    }

    /** @return list<Cotizacion> */
    public function listar(Solicitante $quien, ?string $clienteId, ?string $despuesDe, int $limite): array
    {
        if (! $quien->tieneAlguno(self::VEN_TODAS)) {
            if (! $quien->tiene('cliente') || $quien->clienteId === null) {
                throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver cotizaciones');
            }
            $clienteId = $quien->clienteId;
        }

        return $this->cotizaciones->listar($clienteId, $despuesDe, $limite);
    }
}
