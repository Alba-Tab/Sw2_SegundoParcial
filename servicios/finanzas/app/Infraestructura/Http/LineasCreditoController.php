<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Credito\ConsultarLineaCredito;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class LineasCreditoController
{
    public function __construct(private readonly ConsultarLineaCredito $consultar) {}

    public function mia(Request $req): JsonResponse
    {
        $r = $this->consultar->mia(SolicitanteHttp::de($req));

        return new JsonResponse(Formato::linea($r['linea'], $r['enMora']));
    }

    public function deCliente(Request $req, string $clienteId): JsonResponse
    {
        $r = $this->consultar->deCliente(SolicitanteHttp::de($req), $clienteId);

        return new JsonResponse(Formato::linea($r['linea'], $r['enMora']));
    }
}
