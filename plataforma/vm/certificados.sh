#!/usr/bin/env bash
# CA propia y certificados de Temporal y RabbitMQ (B4). Salida en certs/ (ignorado por git).
# Uso: ./certificados.sh <dominio>    (local: ./certificados.sh localhost)
# Idempotente: no regenera la CA (eso invalidaría todos los clientes) ni un certificado que ya exista,
# salvo el del servidor si cambió el dominio. ca.key nunca sale de la Mac: guárdala en el gestor de contraseñas.
set -euo pipefail
DOMINIO=${1:?uso: $0 <dominio>}
cd "$(dirname "$0")"
umask 077
mkdir -p certs && cd certs

if [ ! -f ca.key ]; then
  openssl req -x509 -new -newkey rsa:3072 -nodes -keyout ca.key -out ca.pem -days 3650 -sha256 \
    -subj "/O=transporte/CN=transporte-ca" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  echo "CA creada"
fi

firmar() { # nombre extendedKeyUsage subjectAltName
  local ext; ext=$(mktemp)
  # Python 3.13 (Analítica) verifica en modo estricto y exige los identificadores de clave.
  printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=%s\nsubjectAltName=%s\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n' "$2" "$3" > "$ext"
  # genpkey escribe PKCS#8 (BEGIN PRIVATE KEY), el formato que pide SimpleSslContextBuilder.forPKCS8 en Viajes.
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$1.key" 2>/dev/null
  openssl req -new -key "$1.key" -subj "/O=transporte/CN=$1" \
    | openssl x509 -req -CA ca.pem -CAkey ca.key -CAcreateserial -days 825 -sha256 -extfile "$ext" -out "$1.pem" 2>/dev/null
  rm -f "$ext"
  echo "certificado $1"
}

# Con temporal y rabbitmq en el SAN, Viajes y temporal-ui entran por la red de docker sin forzar el nombre.
# clientAuth: con requireClientAuth, Temporal presenta este mismo certificado en sus llamadas internas (internode).
if [ ! -f servidor.pem ] || ! openssl x509 -in servidor.pem -noout -ext subjectAltName | grep -qw "DNS:mq.$DOMINIO"; then
  firmar servidor serverAuth,clientAuth "DNS:mq.$DOMINIO,DNS:temporal,DNS:rabbitmq,DNS:localhost,IP:127.0.0.1"
fi
for c in cliente-viajes cliente-flota-worker cliente-finanzas-worker cliente-temporal-ui cliente-admin; do
  [ -f "$c.pem" ] || firmar "$c" clientAuth "DNS:$c"
done

# Los contenedores (RabbitMQ, Temporal) corren con otro usuario: las claves de hoja deben poder leerse al montarlas.
chmod 600 ca.key; chmod 644 ./*.pem servidor.key cliente-*.key
for c in servidor cliente-*; do c=${c%.pem}; [ -f "$c.pem" ] && openssl verify -CAfile ca.pem "$c.pem"; done | sort -u
