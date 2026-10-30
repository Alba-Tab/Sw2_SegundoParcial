"""PostgreSQL real (Testcontainers) con las migraciones de Alembic; tokens firmados con una llave de prueba."""

import json
import os
import time
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import text
from testcontainers.community.postgres import PostgresContainer

EMISOR = "http://keycloak.prueba/realms/transporte"
LLAVE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
CONTRATOS = Path(__file__).resolve().parents[3] / "contratos"


@pytest.fixture(scope="session", autouse=True)
def base() -> Iterator[str]:
    with PostgresContainer("postgres:18-alpine", driver="psycopg") as pg:
        url = pg.get_connection_url()
        os.environ.update(
            DATABASE_URL=url,
            OIDC_ISSUER=EMISOR,
            CONSUMIR_EVENTOS="false",
            PUBLICAR_OUTBOX="false",
            PROGRAMAR_TAREAS="false",
            CONTRATOS_DIR=str(CONTRATOS),
            MODELOS_DIR=str(Path(__file__).parent / "sin-modelos"),
        )
        from alembic import command
        from alembic.config import Config

        command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
        yield url


@pytest.fixture(autouse=True)
def limpia(base: str) -> Iterator[None]:
    from app.infraestructura.bd import motor

    yield
    with motor().begin() as c:
        tablas = c.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'")
        ).scalars()
        c.execute(text("TRUNCATE " + ", ".join(tablas) + " RESTART IDENTITY"))
        c.execute(text("INSERT INTO estado_lectura VALUES (1, NULL)"))


@pytest.fixture(autouse=True)
def llaves(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api import seguridad

    monkeypatch.setattr(
        seguridad,
        "_llaves",
        lambda: SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=LLAVE.public_key())),
    )


def token(*roles: str, sub: str | None = None, azp: str = "gateway", aud: str = "analitica") -> dict[str, str]:
    datos = {
        "iss": EMISOR,
        "aud": aud,
        "sub": sub or str(uuid4()),
        "azp": azp,
        "exp": int(time.time()) + 300,
        "realm_access": {"roles": list(roles)},
    }
    return {"Authorization": "Bearer " + jwt.encode(datos, LLAVE, algorithm="RS256")}


def ejemplo(evento: str, /, **datos: Any) -> dict[str, Any]:
    """El ejemplo del contrato con un id nuevo y los datos cambiados."""
    ruta = next(CONTRATOS.glob(f"eventos/*/{evento}.v1.schema.json"))
    sobre = json.loads(ruta.read_text("utf-8"))["examples"][0]
    return {**sobre, "id": str(uuid4()), "datos": {**sobre["datos"], **datos}}


@pytest.fixture
def cliente():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
