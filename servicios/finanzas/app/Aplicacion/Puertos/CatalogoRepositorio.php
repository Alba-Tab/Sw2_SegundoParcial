<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Catalogo\Tarifa;
use App\Dominio\Comun\TipoCarga;

/** Copias de cliente y ruta (alimentadas por eventos de Viajes) y tarifas (D10). */
interface CatalogoRepositorio
{
    public function clienteReplicado(string $clienteId): bool;

    public function rutaActiva(string $rutaId): bool;

    public function tarifa(string $rutaId, TipoCarga $tipoCarga): ?Tarifa;

    /**
     * Crea o actualiza la copia si `versionAgregado` es mayor que la guardada.
     *
     * @param  array<string, mixed>  $datos  datos de ClienteActualizado.v1
     * @return array{aplicado: bool, nuevo: bool}
     */
    public function aplicarCliente(array $datos): array;

    /** @param array<string, mixed> $datos datos de RutaActualizada.v1 */
    public function aplicarRuta(array $datos): bool;
}
