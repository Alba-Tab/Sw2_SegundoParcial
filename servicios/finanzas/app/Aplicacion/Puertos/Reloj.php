<?php

namespace App\Aplicacion\Puertos;

interface Reloj
{
    public function ahora(): \DateTimeImmutable;
}
