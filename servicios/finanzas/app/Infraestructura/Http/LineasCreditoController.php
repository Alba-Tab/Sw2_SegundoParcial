<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Credito\ConsultarLineaCredito;
use App\Aplicacion\Credito\GestionarLineaCredito;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Líneas de crédito (specs 003 y 012). La forma de la petición ya la validó ValidarContrato contra finanzas.yaml. */
final class LineasCreditoController
{
    public function __construct(
        private readonly ConsultarLineaCredito $consultar,
        private readonly GestionarLineaCredito $gestionar,
        private readonly Idempotencia $idempotencia,
    ) {}

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

    /** B5: `?clienteIds=a,b,…` (hasta 100, lo limita el contrato); un cliente sin línea no sale. */
    public function deClientes(Request $req): JsonResponse
    {
        $ids = explode(',', (string) $req->query('clienteIds'));
        $lineas = $this->consultar->deClientes(SolicitanteHttp::de($req), $ids);

        return new JsonResponse(['items' => array_map(fn (array $r) => Formato::linea($r['linea'], $r['enMora']), $lineas)]);
    }

    public function ajustar(Request $req, string $clienteId): JsonResponse
    {
        return $this->idempotencia->ejecutar($req, 'AJUSTAR_LINEA_CREDITO', function () use ($req, $clienteId) {
            $r = $this->gestionar->ajustarLimite(SolicitanteHttp::de($req), $clienteId, $req->json('limite'), (string) $req->json('motivo'));

            return new JsonResponse(Formato::linea($r['linea'], $r['enMora']));
        });
    }

    public function cambiarEstado(Request $req, string $clienteId): JsonResponse
    {
        return $this->idempotencia->ejecutar($req, 'CAMBIAR_ESTADO_LINEA_CREDITO', function () use ($req, $clienteId) {
            $r = $this->gestionar->cambiarEstado(SolicitanteHttp::de($req), $clienteId, (bool) $req->json('suspendida'),
                (string) $req->json('motivo'));

            return new JsonResponse(Formato::linea($r['linea'], $r['enMora']));
        });
    }
}
