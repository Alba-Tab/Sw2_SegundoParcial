# Contexto: raíz del repo (para leer contratos/).
FROM composer:2 AS composer
FROM ghcr.io/roadrunner-server/roadrunner:3.0.1 AS rr

FROM php:8.4-cli
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libzip-dev unzip git \
  && docker-php-ext-install pdo_pgsql sockets zip pcntl && rm -rf /var/lib/apt/lists/*
COPY --from=composer /usr/bin/composer /usr/bin/composer
COPY --from=rr /usr/bin/rr /usr/local/bin/rr
WORKDIR /app
RUN composer create-project laravel/laravel . "^13.0" --no-interaction --prefer-dist --no-scripts \
  && composer require temporal/sdk:^2.20 --no-interaction \
  && cp .env.example .env && php artisan key:generate
COPY plataforma/poc/temporal/finanzas/app app
COPY plataforma/poc/temporal/finanzas/database database
COPY plataforma/poc/temporal/finanzas/worker.php plataforma/poc/temporal/finanzas/.rr.yaml ./
COPY contratos/temporal/programar-viaje.schema.json /contratos/
CMD ["sh", "-c", "php artisan migrate --force && rr serve -c .rr.yaml"]
