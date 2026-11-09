# Finanzas: una imagen para la API (Octane sobre RoadRunner, 4 workers) y el worker (RoadRunner con Temporal y el
# plugin service, D29). Etapas: base (PHP 8.4 y herramientas), dev (con dependencias de desarrollo), app (producción).
# Contexto: raíz del repo, para copiar contratos/openapi (ValidarContrato).
FROM ghcr.io/roadrunner-server/roadrunner:3.0.1 AS rr
# Octane 2.22 compara la versión de rr contra 2023.3.0 (versionado por fecha) y trata 3.x como vieja: la API usa
# 2025.1.15 en /app/rr, donde Octane busca primero; el worker usa 3.0.1 (/usr/local/bin/rr, PoC-2).
FROM ghcr.io/roadrunner-server/roadrunner:2025.1.15 AS rr-octane
FROM composer:2 AS composer

FROM php:8.4-cli AS base
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libzip-dev libicu-dev unzip git $PHPIZE_DEPS \
  && docker-php-ext-install pdo_pgsql sockets pcntl zip intl bcmath opcache \
  && pecl install opentelemetry && docker-php-ext-enable opentelemetry \
  && apt-get purge -y $PHPIZE_DEPS && apt-get autoremove -y && rm -rf /var/lib/apt/lists/* /tmp/pear
COPY --from=rr /usr/bin/rr /usr/local/bin/rr
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
WORKDIR /app

FROM base AS dev
COPY servicios/finanzas/composer.json servicios/finanzas/composer.lock ./
RUN composer install --no-interaction --no-scripts --no-autoloader
COPY servicios/finanzas .
COPY contratos/openapi/finanzas.yaml contratos/openapi/comun.yaml contrato/
COPY contratos/eventos contrato/eventos/
COPY contratos/comun contrato/comun/
COPY plataforma/semilla semilla/
RUN composer dump-autoload --optimize && cp -n .env.example .env

FROM base AS app
ENV APP_ENV=production
COPY servicios/finanzas/composer.json servicios/finanzas/composer.lock ./
RUN composer install --no-interaction --no-dev --no-scripts --no-autoloader
COPY servicios/finanzas .
COPY contratos/openapi/finanzas.yaml contratos/openapi/comun.yaml contrato/
COPY contratos/eventos contrato/eventos/
COPY contratos/comun contrato/comun/
COPY plataforma/semilla semilla/
COPY --from=rr-octane /usr/bin/rr /app/rr
RUN composer dump-autoload --optimize --classmap-authoritative \
  && useradd --system --uid 10001 finanzas && chown -R finanzas storage bootstrap/cache
USER finanzas
EXPOSE 8103
CMD ["php", "artisan", "octane:start", "--server=roadrunner", "--host=0.0.0.0", "--port=8103", "--workers=4", "--rr-config=.rr.octane.yaml"]
