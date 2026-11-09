"""Rendimiento de una carga de combustible (spec 013, paso 8)."""

from decimal import ROUND_HALF_UP, Decimal


def km_por_litro(kilometraje: int, kilometraje_anterior: int | None, litros: float | Decimal) -> Decimal | None:
    """(kilometraje − el de la carga anterior del mismo tracto) / litros. La primera carga no tiene referencia."""
    if kilometraje_anterior is None or float(litros) <= 0 or kilometraje <= kilometraje_anterior:
        return None
    valor = Decimal(kilometraje - kilometraje_anterior) / Decimal(str(litros))
    return valor.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
