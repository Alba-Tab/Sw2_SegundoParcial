#!/bin/sh
# Crea un usuario y su base por servicio (nada compartido entre servicios). BASES lista "usuario" o "usuario:base"
# (Temporal usa dos bases con el mismo usuario). La clave de cada usuario sale de CLAVE_<USUARIO> en .env.
# Corre una sola vez, cuando el volumen está vacío.
set -eu
for item in $BASES; do
  usuario=${item%%:*}; base=${item#*:}
  clave=$(printenv "CLAVE_$(echo "$usuario" | tr '[:lower:]' '[:upper:]')")
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -tc "SELECT 1 FROM pg_roles WHERE rolname = '$usuario'" | grep -q 1 \
    || psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -c "CREATE USER $usuario WITH PASSWORD '$clave'"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -c "CREATE DATABASE $base OWNER $usuario"
done
