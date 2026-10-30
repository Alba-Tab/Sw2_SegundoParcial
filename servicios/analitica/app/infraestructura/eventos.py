"""Validación de los sobres contra contratos/eventos (JSON Schema 2020-12). Un evento inválido va a la DLQ."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from app.configuracion import configuracion


@lru_cache
def _validadores() -> dict[tuple[str, int], Draft202012Validator]:
    raiz = Path(configuracion().contratos_dir)
    esquemas = [json.loads(p.read_text("utf-8")) for p in raiz.rglob("*.schema.json") if "node_modules" not in p.parts]
    registro: Registry = Registry().with_resources((e["$id"], Resource.from_contents(e)) for e in esquemas)
    validadores = {}
    for e in esquemas:
        tipo = ((e.get("properties") or {}).get("tipo") or {}).get("const")
        version = ((e.get("properties") or {}).get("version") or {}).get("const")
        if tipo and version:
            validadores[(tipo, version)] = Draft202012Validator(
                e, registry=registro, format_checker=Draft202012Validator.FORMAT_CHECKER
            )
    return validadores


def valido(sobre: Any) -> bool:
    if not isinstance(sobre, dict):
        return False
    validador = _validadores().get((sobre.get("tipo"), sobre.get("version")))
    return validador is not None and validador.is_valid(sobre)
