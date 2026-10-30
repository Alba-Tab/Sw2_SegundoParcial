"""Puntaje de conducción (D84): frenadas y fatigas por cada 100 km."""

from decimal import ROUND_HALF_UP, Decimal


def puntaje(frenadas: int, fatigas: int, km: float | Decimal | None) -> float:
    """max(0, 100 − 10 × (frenadas + 2 × fatigas) × 100 / km). Sin km recorridos, solo cuenta si hubo eventos."""
    eventos = frenadas + 2 * fatigas
    if eventos == 0:
        return 100.0
    if not km or float(km) <= 0:
        return 0.0
    valor = max(0.0, 100 - 10 * eventos * 100 / float(km))
    return float(Decimal(str(valor)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
