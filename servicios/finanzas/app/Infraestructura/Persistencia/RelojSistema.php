<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\Reloj;

final class RelojSistema implements Reloj
{
    public function ahora(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }
}
