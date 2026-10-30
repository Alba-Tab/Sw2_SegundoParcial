"""Token de Keycloak con emisor OIDC_ISSUER y audiencia `analitica`; roles del realm (000 §8).

Las llaves se bajan en la primera petición (PyJWKClient es perezoso): Analítica arranca sin Keycloak. Sin OIDC_ISSUER,
/api/** responde 503 DEPENDENCIA_NO_DISPONIBLE (P10).
"""

from dataclasses import dataclass, field
from functools import lru_cache

import jwt
from fastapi import Request

from app.configuracion import configuracion
from app.dominio.errores import ErrorDeDominio


@dataclass(frozen=True)
class Usuario:
    sub: str
    roles: frozenset[str] = field(default_factory=frozenset)
    azp: str | None = None
    token: str = ""

    @property
    def rol(self) -> str | None:
        """El rol principal para la auditoría."""
        for r in ("gerente", "despachador", "jefe_flota", "administracion", "agente_lectura"):
            if r in self.roles:
                return r
        return next(iter(sorted(self.roles)), None)


@lru_cache
def _llaves() -> jwt.PyJWKClient:
    issuer = configuracion().oidc_issuer.rstrip("/")
    return jwt.PyJWKClient(f"{issuer}/protocol/openid-connect/certs", cache_keys=True, lifespan=600, timeout=5)


def usuario_actual(request: Request) -> Usuario:
    # El middleware de main ya lo validó para /api/**.
    if isinstance(getattr(request.state, "usuario", None), Usuario):
        return request.state.usuario
    issuer = configuracion().oidc_issuer.rstrip("/")
    if not issuer:
        raise ErrorDeDominio("DEPENDENCIA_NO_DISPONIBLE", "OIDC_ISSUER no está configurado")
    cabecera = request.headers.get("authorization", "")
    if not cabecera.startswith("Bearer "):
        raise ErrorDeDominio("NO_AUTENTICADO", "Falta el token")
    token = cabecera.removeprefix("Bearer ")
    try:
        llave = _llaves().get_signing_key_from_jwt(token)
        datos = jwt.decode(token, llave.key, algorithms=["RS256"], audience=configuracion().audiencia, issuer=issuer)
    except jwt.PyJWKClientConnectionError as e:
        raise ErrorDeDominio("DEPENDENCIA_NO_DISPONIBLE", "Keycloak no responde") from e
    except jwt.PyJWTError as e:
        raise ErrorDeDominio("NO_AUTENTICADO", "El token no es válido") from e
    roles = (datos.get("realm_access") or {}).get("roles") or []
    return Usuario(
        sub=str(datos["sub"]),
        roles=frozenset(r for r in roles if isinstance(r, str)),
        azp=datos.get("azp"),
        token=token,
    )


def exigir(usuario: Usuario, *roles: str) -> None:
    if not usuario.roles & set(roles):
        raise ErrorDeDominio("SIN_PERMISO", "Tu rol no tiene acceso a esta operación")
