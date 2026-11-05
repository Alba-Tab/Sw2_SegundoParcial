#!/usr/bin/env bash
# Arma el .env y certs/ de la VM desde Parameter Store (B3). Lo corre el despliegue por SSM antes de docker compose up.
#   /transporte/env/<VARIABLE>   -> línea VARIABLE='valor' en .env (SecureString para las claves, String para lo demás)
#   /transporte/certs/<archivo>  -> certs/<archivo> (ca.pem, servidor.pem/.key y los cliente-*.pem/.key de la VM)
# ca.key nunca va a Parameter Store: se queda en la Mac (certificados.sh).
# Necesita la CLI de AWS y python3 (los dos vienen en Amazon Linux 2023) y el rol de la EC2 con ssm:GetParameters*.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
REGION=${AWS_REGION:-us-east-1}
mkdir -p certs
aws ssm get-parameters-by-path --region "$REGION" --path /transporte/ --recursive --with-decryption --output json \
  | python3 -I -c '
import json, os, re, sys
lineas = []
for p in json.load(sys.stdin)["Parameters"]:
    nombre, valor = p["Name"], p["Value"]
    if nombre.startswith("/transporte/env/"):
        var = nombre.rsplit("/", 1)[1]
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", var) or "\x27" in valor or "\n" in valor:
            sys.exit(f"parámetro inválido para .env: {nombre}")
        lineas.append(f"{var}=\x27{valor}\x27")
    elif nombre.startswith("/transporte/certs/"):
        archivo = nombre.rsplit("/", 1)[1]
        if not re.fullmatch(r"[a-z0-9-]+\.(pem|key)", archivo) or archivo == "ca.key":
            sys.exit(f"parámetro inválido para certs/: {nombre}")
        with open(os.path.join("certs", archivo), "w") as f:
            f.write(valor if valor.endswith("\n") else valor + "\n")
with open(".env.nuevo", "w") as f:
    f.write("\n".join(sorted(lineas)) + "\n")
print(f"{len(lineas)} variables en .env")
'
mv .env.nuevo .env
# Los contenedores (RabbitMQ, Temporal) corren con otro usuario; la carpeta certs/ sigue cerrada para el resto.
chmod 644 certs/*
ls certs
