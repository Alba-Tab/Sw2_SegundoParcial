<?php

namespace App\Dominio\Comun;

/** contratos/comun/tipos.schema.json#/$defs/TipoCarga */
enum TipoCarga: string
{
    case GRANOS = 'GRANOS';
    case INSUMOS = 'INSUMOS';
    case INSUMOS_LIQUIDOS = 'INSUMOS_LIQUIDOS';
    case CONTENEDOR = 'CONTENEDOR';
}
