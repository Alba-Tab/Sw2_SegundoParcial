# Contexto: raíz del repo (contratos para validar eventos, plataforma/semilla para demo:reiniciar).
FROM ghcr.io/astral-sh/uv:0.13.1-python3.13-trixie-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY servicios/analitica/pyproject.toml servicios/analitica/uv.lock servicios/analitica/.python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY servicios/analitica/app app
COPY servicios/analitica/migraciones migraciones
COPY servicios/analitica/alembic.ini ./

FROM python:3.13-slim-trixie
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 CONTRATOS_DIR=/app/contratos MODELOS_DIR=/app/modelos
WORKDIR /app
RUN useradd --system --uid 10001 analitica
COPY --from=build /app /app
COPY contratos/eventos contratos/eventos/
COPY contratos/comun contratos/comun/
COPY plataforma/semilla semilla/
USER analitica
EXPOSE 8104
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8104 --proxy-headers"]
