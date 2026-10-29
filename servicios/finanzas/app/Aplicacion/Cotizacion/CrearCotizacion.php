<?php

namespace App\Aplicacion\Cotizacion;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Aplicacion\Puertos\Reloj;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\TipoCarga;
use App\Dominio\Cotizacion\Cotizacion;
use DateInterval;

/**
 * POST /api/v1/cotizaciones (spec 002). El cliente cotiza para sí mismo (clienteId del token); comercial a nombre de
 * un cliente (clienteId del cuerpo, canal TELEFONO). No reserva nada.
 */
final class CrearCotizacion
{
    public function __construct(
        private readonly CotizacionRepositorio $cotizaciones,
        private readonly CatalogoRepositorio $catalogo,
        private readonly Reloj $reloj,
        private readonly DateInterval $vigencia,
    ) {}

    public function ejecutar(Solicitante $quien, string $rutaId, string $tipoCarga, string $toneladas, string $fechaViaje, ?string $clienteIdCuerpo): Cotizacion
    {
        if ($quien->tiene('cliente')) {
            $clienteId = $quien->clienteId ?? throw new ErrorDeDominio('SIN_PERMISO', 'El token no trae clienteId');
            $canal = 'PORTAL';
        } elseif ($quien->tiene('comercial')) {
            $clienteId = $clienteIdCuerpo ?? throw new ErrorDeDominio('VALIDACION', 'clienteId: es obligatorio con rol comercial');
            $canal = 'TELEFONO';
        } else {
            throw new ErrorDeDominio('SIN_PERMISO', 'Solo un cliente o comercial cotiza');
        }
        if (! $this->catalogo->clienteReplicado($clienteId)) {
            throw new ErrorDeDominio('CLIENTE_NO_REPLICADO', 'El cliente todavía no llegó a Finanzas; reintenta en unos segundos');
        }
        if (! $this->catalogo->rutaActiva($rutaId)) {
            throw new ErrorDeDominio('NO_ENCONTRADO', 'La ruta no existe o no está activa');
        }
        $carga = TipoCarga::from($tipoCarga);
        $tarifa = $this->catalogo->tarifa($rutaId, $carga)
            ?? throw new ErrorDeDominio('VALIDACION', 'tipoCarga: la ruta no tiene tarifa para esa carga');
        $cotizacion = Cotizacion::calcular($clienteId, $rutaId, $carga, $toneladas, $fechaViaje, $tarifa->porTonelada, $canal,
            $this->reloj->ahora(), $this->vigencia);
        $this->cotizaciones->guardar($cotizacion);

        return $cotizacion;
    }
}
