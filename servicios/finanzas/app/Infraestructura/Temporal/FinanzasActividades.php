<?php

namespace App\Infraestructura\Temporal;

use App\Aplicacion\Saga\LiberarCredito;
use App\Aplicacion\Saga\RegistrarDecisionCredito;
use App\Aplicacion\Saga\ValidarYReservarCredito;
use App\Dominio\Comun\ErrorDeDominio;
use App\Infraestructura\Http\Formato;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Temporal\Activity\ActivityInterface;
use Temporal\Activity\ActivityMethod;
use Temporal\DataConverter\EncodedValues;
use Temporal\Exception\Failure\ApplicationErrorCategory;
use Temporal\Exception\Failure\ApplicationFailure;

/**
 * Actividades Finanzas.* de la saga ProgramarViaje (contratos/temporal/programar-viaje.md), cola `finanzas`. Cada una
 * corre su caso de uso en una transacción. Un ErrorDeDominio sale como ApplicationFailure con `type` = código y un
 * DetalleFallo; CLIENTE_NO_REPLICADO y DEPENDENCIA_NO_DISPONIBLE son reintentables, los demás no (S9).
 *
 * Un error de negocio no reintentable (CREDITO_INSUFICIENTE, COTIZACION_AJENA…) es una respuesta esperada de la saga:
 * sale con la categoría BENIGN, y el SDK de Go de RoadRunner lo deja en DEBUG en vez de "Activity error." en ERROR. El
 * registro que queda es el INFO de esta clase. Las fallas reintentables siguen en ERROR en cada intento.
 */
#[ActivityInterface(prefix: 'Finanzas.')]
final class FinanzasActividades
{
    private const REINTENTABLES = ['CLIENTE_NO_REPLICADO', 'DEPENDENCIA_NO_DISPONIBLE'];

    public function __construct(
        private readonly ValidarYReservarCredito $validar,
        private readonly RegistrarDecisionCredito $decision,
        private readonly LiberarCredito $liberar,
    ) {}

    /**
     * @param  array{servicioId: string, clienteId: string, cotizacionId: string, esperaAprobacion: string}  $entrada
     * @return array<string, mixed> ValidarYReservarCreditoResultado
     */
    #[ActivityMethod('validarYReservarCredito')]
    public function validarYReservarCredito(array $entrada): array
    {
        $r = $this->transaccion(fn () => $this->validar->ejecutar($entrada['servicioId'], $entrada['clienteId'], $entrada['cotizacionId'],
            new \DateInterval($entrada['esperaAprobacion'])));
        $c = $r->cotizacion;

        return array_filter([
            'resultado' => $r->requiereAprobacion() ? 'REQUIERE_APROBACION' : 'RESERVADO',
            'reservaCreditoId' => $r->reserva->id,
            'rutaId' => $c->rutaId,
            'tipoCarga' => $c->tipoCarga->value,
            'toneladas' => Formato::numero($c->toneladas),
            'fechaViaje' => $c->fechaViaje,
            'monto' => $r->reserva->monto->aContrato(),
            'motivosAprobacion' => $r->requiereAprobacion() ? $r->motivosAprobacion : null,
        ], fn ($v) => $v !== null);
    }

    /** @param  array{servicioId: string, decision: string, aprobadoPor: string, motivo?: string}  $entrada */
    #[ActivityMethod('registrarDecisionCredito')]
    public function registrarDecisionCredito(array $entrada): void
    {
        $this->transaccion(fn () => $this->decision->ejecutar($entrada['servicioId'], $entrada['decision'], $entrada['aprobadoPor'],
            $entrada['motivo'] ?? null));
    }

    /** @param  array{servicioId: string, motivo: string}  $entrada */
    #[ActivityMethod('liberarCredito')]
    public function liberarCredito(array $entrada): void
    {
        $this->transaccion(fn () => $this->liberar->ejecutar($entrada['servicioId'], $entrada['motivo']));
    }

    /**
     * @template T
     *
     * @param  \Closure(): T  $caso
     * @return T
     */
    private function transaccion(\Closure $caso): mixed
    {
        try {
            return DB::transaction($caso, 3);
        } catch (ErrorDeDominio $e) {
            Log::info('Actividad con error de negocio', ['codigo' => $e->codigo, 'mensaje' => $e->getMessage()]);
            $detalle = array_filter(['codigo' => $e->codigo, 'mensaje' => $e->getMessage(), 'datos' => $e->datos ?: null]);
            $noReintentable = ! in_array($e->codigo, self::REINTENTABLES, true);
            throw new ApplicationFailure($e->getMessage(), $e->codigo, $noReintentable, EncodedValues::fromValues([$detalle]),
                category: $noReintentable ? ApplicationErrorCategory::Benign : ApplicationErrorCategory::Unspecified);
        }
    }
}
