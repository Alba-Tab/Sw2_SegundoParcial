<?php

namespace App\Aplicacion\Credito;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\Auditoria;
use App\Aplicacion\Puertos\EvaluadorMora;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\Reloj;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Credito\LineaCredito;

/**
 * G6 (spec 012): administración o gerente ajusta el límite o suspende/reactiva la línea, dentro de la transacción de la
 * idempotencia. La línea se lee con FOR UPDATE (000 §9); la regla vive en el agregado y el cambio queda en la auditoría.
 * Sin evento: ningún otro servicio guarda la línea.
 */
final class GestionarLineaCredito
{
    public function __construct(
        private readonly LineaCreditoRepositorio $lineas,
        private readonly Auditoria $auditoria,
        private readonly EvaluadorMora $mora,
        private readonly Reloj $reloj,
    ) {}

    /**
     * @param  array{monto: string, moneda: string}  $limite
     * @return array{linea: LineaCredito, enMora: bool}
     */
    public function ajustarLimite(Solicitante $quien, string $clienteId, array $limite, string $motivo): array
    {
        $motivo = self::motivo($quien, $motivo);
        try {
            $valor = Monto::desdeContrato($limite);
        } catch (ErrorDeDominio $e) {
            throw new ErrorDeDominio('VALIDACION', 'limite: '.$e->getMessage(), ['campo' => 'limite']);
        }
        $anterior = $this->bloquear($clienteId);
        $linea = $anterior->ajustarLimite($valor);
        $this->lineas->actualizar($linea);
        $this->auditoria->registrar($quien, 'CENTRO_CONTROL', 'AJUSTAR_LINEA_CREDITO', 'LineaCredito', $clienteId,
            ['limiteAnterior' => $anterior->limite->aContrato(), 'limite' => $valor->aContrato(), 'motivo' => $motivo]);

        return $this->conMora($linea);
    }

    /** @return array{linea: LineaCredito, enMora: bool} */
    public function cambiarEstado(Solicitante $quien, string $clienteId, bool $suspendida, string $motivo): array
    {
        $motivo = self::motivo($quien, $motivo);
        $linea = $this->bloquear($clienteId)->cambiarEstado($suspendida);
        $this->lineas->actualizar($linea);
        $this->auditoria->registrar($quien, 'CENTRO_CONTROL', $suspendida ? 'SUSPENDER_LINEA_CREDITO' : 'REACTIVAR_LINEA_CREDITO',
            'LineaCredito', $clienteId, ['motivo' => $motivo]);

        return $this->conMora($linea);
    }

    /** Rol y motivo de 3 a 300 caracteres sin los espacios de los extremos (el contrato no los ve). */
    private static function motivo(Solicitante $quien, string $motivo): string
    {
        if (! $quien->tieneAlguno(['administracion', 'gerente'])) {
            throw new ErrorDeDominio('SIN_PERMISO', 'Solo administración o gerencia gestiona líneas de crédito');
        }
        $motivo = trim($motivo);
        if (mb_strlen($motivo) < 3 || mb_strlen($motivo) > 300) {
            throw new ErrorDeDominio('VALIDACION', 'motivo: de 3 a 300 caracteres', ['campo' => 'motivo']);
        }

        return $motivo;
    }

    private function bloquear(string $clienteId): LineaCredito
    {
        return $this->lineas->paraActualizar($clienteId) ?? throw new ErrorDeDominio('NO_ENCONTRADO', 'El cliente no tiene línea de crédito');
    }

    /** @return array{linea: LineaCredito, enMora: bool} */
    private function conMora(LineaCredito $linea): array
    {
        return ['linea' => $linea, 'enMora' => $this->mora->enMora($linea->clienteId, $this->reloj->ahora())];
    }
}
