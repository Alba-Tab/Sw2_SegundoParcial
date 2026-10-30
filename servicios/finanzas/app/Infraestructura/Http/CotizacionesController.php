<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Cotizacion\ConsultarCotizaciones;
use App\Aplicacion\Cotizacion\CrearCotizacion;
use App\Aplicacion\Puertos\Reloj;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Cotizaciones (spec 002). La forma de la petición ya la validó ValidarContrato contra finanzas.yaml. */
final class CotizacionesController
{
    public function __construct(
        private readonly CrearCotizacion $crear,
        private readonly ConsultarCotizaciones $consultar,
        private readonly Idempotencia $idempotencia,
        private readonly Reloj $reloj,
    ) {}

    public function crear(Request $req): JsonResponse
    {
        // El número JSON tal como llegó (json_encode da la forma más corta que lo representa): 30.0000001 no se
        // redondea a "30" antes de que el dominio revise los decimales.
        $toneladas = $req->json('toneladas');
        $toneladas = is_int($toneladas) || is_float($toneladas) ? (string) json_encode($toneladas) : (string) $toneladas;

        return $this->idempotencia->ejecutar($req, 'CREAR_COTIZACION', function () use ($req, $toneladas) {
            $c = $this->crear->ejecutar(SolicitanteHttp::de($req), $req->json('rutaId'), $req->json('tipoCarga'),
                $toneladas, $req->json('fechaViaje'), $req->json('clienteId'));

            return new JsonResponse(Formato::cotizacion($c, $this->reloj->ahora()), 201, ['Location' => "/api/v1/cotizaciones/{$c->id}"]);
        });
    }

    public function obtener(Request $req, string $cotizacionId): JsonResponse
    {
        return new JsonResponse(Formato::cotizacion($this->consultar->obtener(SolicitanteHttp::de($req), $cotizacionId), $this->reloj->ahora()));
    }

    public function listar(Request $req): JsonResponse
    {
        $limite = (int) $req->query('limite', '20');
        $lote = $this->consultar->listar(SolicitanteHttp::de($req), $req->query('clienteId'), Formato::desdeCursor($req->query('cursor')), $limite + 1);
        $items = array_slice($lote, 0, $limite);
        $ahora = $this->reloj->ahora();

        return new JsonResponse([
            'items' => array_map(fn ($c) => Formato::cotizacion($c, $ahora), $items),
            'siguienteCursor' => count($lote) > $limite ? Formato::aCursor(end($items)->id) : null,
        ]);
    }
}
