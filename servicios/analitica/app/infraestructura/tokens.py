"""Token de Keycloak del agente (client credentials, spec 014)."""

import time

import httpx

from app.configuracion import configuracion


class ErrorToken(Exception):
    pass


class Tokens:
    """Caché en memoria hasta 30 s antes de vencer (spec 014, paso 4)."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[str, float]] = {}

    def _url(self) -> str:
        return f"{configuracion().oidc_issuer.rstrip('/')}/protocol/openid-connect/token"

    def _purgar(self, ahora: float) -> None:
        """Los intercambios van por `sub` y vencimiento: sin purga la caché crece con cada token de usuario."""
        for clave in [c for c, (_, vence) in self._cache.items() if vence - 30 <= ahora]:
            del self._cache[clave]

    async def _pedir(self, clave: str, datos: dict[str, str]) -> str:
        self._purgar(time.time())
        guardado = self._cache.get(clave)
        if guardado:
            return guardado[0]
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.post(self._url(), data=datos)
        except httpx.HTTPError as e:
            raise ErrorToken(f"Keycloak no responde: {e}") from e
        if r.status_code != 200:
            raise ErrorToken(f"Keycloak respondió {r.status_code}: {r.text[:200]}")
        cuerpo = r.json()
        self._cache[clave] = (cuerpo["access_token"], time.time() + float(cuerpo.get("expires_in", 60)))
        return cuerpo["access_token"]

    async def del_agente(self) -> str:
        """Cliente `agente` con el rol `agente_lectura` y audiencia `mcp-server`."""
        return await self._pedir(
            "agente",
            {
                "grant_type": "client_credentials",
                "client_id": "agente",
                "client_secret": configuracion().agente_cliente_secreto,
            },
        )
