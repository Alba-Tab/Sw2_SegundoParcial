# Ayudas de los scripts de demo. Se cargan con: . "$(dirname "$0")/comun.sh"
# Local: tokens con direct grant de demo-cli y la clave de la semilla de plataforma/compose/.env (D39).
# Nube (NUBE=1, lo pone --nube): URLs de DOMINIO y tokens por device grant, con el refresh_token guardado por usuario
# en ~/.cache/transporte-demo para no iniciar sesión en cada corrida (D39). FLOTA_URL y ANALITICA_URL no tienen dominio
# propio: van en el entorno (run.app y azurecontainerapps.io).
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="$RAIZ/plataforma/compose"
if [ -n "${NUBE:-}" ]; then
  : "${DOMINIO:?falta DOMINIO}" "${FLOTA_URL:?falta FLOTA_URL (run.app)}" "${ANALITICA_URL:?falta ANALITICA_URL}"
  OIDC_ISSUER="https://auth.$DOMINIO/realms/transporte"
  VIAJES_URL="https://viajes.$DOMINIO"; FINANZAS_URL="https://finanzas.$DOMINIO"
  export OIDC_ISSUER VIAJES_URL FINANZAS_URL
else
  set -a; . "$COMPOSE/.env"; set +a
fi
VIAJES="${VIAJES_URL:-http://localhost:8101}"
FINANZAS="${FINANZAS_URL:-http://localhost:8103}"

# Ids de plataforma/semilla.
COCHABAMBA=01933a00-0000-7000-8000-000000000001
LA_PAZ=01933a00-0000-7000-8000-000000000002
ARICA=01933a00-0000-7000-8000-000000000003
AULA=01933a00-0000-7000-8000-000000000004
AGROEXPORT=0193a000-0000-7000-8000-0000000c0001
AGRO_MOROSO=0193a000-0000-7000-8000-0000000c0002
FERRETERIA=0193a000-0000-7000-8000-0000000c0003

dc() { docker compose -f "$COMPOSE/compose.yaml" --profile core --profile plataforma "$@"; }
paso() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1], {}, {'d': d}))" "$1"; }

token() { # token <usuario>
  [ -n "${NUBE:-}" ] && { token_nube "$1"; return; }
  curl -sf -X POST "$OIDC_ISSUER/protocol/openid-connect/token" -d grant_type=password -d client_id=demo-cli \
    -d username="$1" -d password="$KC_CLAVE_SEMILLA" -d 'scope=openid aud-viajes aud-finanzas' | json "d['access_token']"
}

token_nube() { # token_nube <usuario>: refresh_token guardado o, si no sirve, device grant (D39)
  local dir="${XDG_CACHE_HOME:-$HOME/.cache}/transporte-demo" r d fin
  mkdir -p "$dir" && chmod 700 "$dir"
  if [ -f "$dir/$1" ]; then
    r=$(curl -s -X POST "$OIDC_ISSUER/protocol/openid-connect/token" -d grant_type=refresh_token -d client_id=demo-cli \
      --data-urlencode "refresh_token=$(cat "$dir/$1")")
  fi
  if ! echo "${r:-}" | json "'access_token' in d" 2>/dev/null | grep -q True; then
    d=$(curl -sf -X POST "$OIDC_ISSUER/protocol/openid-connect/auth/device" -d client_id=demo-cli -d 'scope=openid aud-viajes aud-finanzas')
    echo "Entra como $1 en $(echo "$d" | json "d['verification_uri_complete']")" >&2
    fin=$((SECONDS + $(echo "$d" | json "d.get('expires_in', 600)")))
    while [ $SECONDS -lt $fin ]; do
      sleep "$(echo "$d" | json "d.get('interval', 5)")"
      r=$(curl -s -X POST "$OIDC_ISSUER/protocol/openid-connect/token" -d client_id=demo-cli \
        -d grant_type=urn:ietf:params:oauth:grant-type:device_code -d device_code="$(echo "$d" | json "d['device_code']")")
      echo "$r" | json "'access_token' in d" | grep -q True && break
    done
  fi
  (umask 077; echo "$r" | json "d['refresh_token']" > "$dir/$1"); chmod 600 "$dir/$1"
  echo "$r" | json "d['access_token']"
}

hoy() { TZ=America/La_Paz date +%F; }

cotizar() { # cotizar <token> <rutaId> <tipoCarga> <toneladas> [clienteId] -> cotizacionId
  local extra=""; [ -n "${5:-}" ] && extra=",\"clienteId\":\"$5\""
  curl -sf -X POST "$FINANZAS/api/v1/cotizaciones" -H "Authorization: Bearer $1" -H "Idempotency-Key: $(uuidgen)" \
    -H 'Content-Type: application/json' \
    -d "{\"rutaId\":\"$2\",\"tipoCarga\":\"$3\",\"toneladas\":$4,\"fechaViaje\":\"$(hoy)\"$extra}" | json "d['cotizacionId']"
}

confirmar() { # confirmar <token> <cotizacionId> [clienteId] [clave] -> cuerpo de la respuesta 202
  local extra=""; [ -n "${3:-}" ] && extra=",\"clienteId\":\"$3\""
  curl -sf -X POST "$VIAJES/api/v1/servicios" -H "Authorization: Bearer $1" -H "Idempotency-Key: ${4:-$(uuidgen)}" \
    -H 'Content-Type: application/json' -d "{\"cotizacionId\":\"$2\"$extra}"
}

servicio() { curl -sf "$VIAJES/api/v1/servicios/$2" -H "Authorization: Bearer $1"; }

esperar() { # esperar <token> <servicioId> <expresión python sobre d> [segundos] -> el servicio
  local fin=$((SECONDS + ${4:-60})) cuerpo
  while [ $SECONDS -lt $fin ]; do
    cuerpo=$(servicio "$1" "$2")
    if [ "$(echo "$cuerpo" | json "bool($3)")" = True ]; then echo "$cuerpo"; return 0; fi
    echo "  … $(echo "$cuerpo" | json "d['estado'] + ' ' + d.get('etapa', '')")" >&2
    sleep 2
  done
  echo "No llegó a: $3" >&2; echo "$cuerpo" >&2; return 1
}

esperado() { # esperado <descripción> <real> <esperado>
  if [ "$2" = "$3" ]; then echo "  ✔ $1: $2"; else echo "  ✘ $1: '$2' (se esperaba '$3')"; exit 1; fi
}

disponible() { # disponible <token admin> <clienteId>
  curl -sf "$FINANZAS/api/v1/lineas-credito/$2" -H "Authorization: Bearer $1" | json "d['disponible']['monto']"
}

liberar() { # liberar <servicioId>: cancela como despachador un servicio de prueba para devolver su furgón (hay 3)
  curl -sf -o /dev/null -X POST "$VIAJES/api/v1/servicios/$1/cancelacion" -H "Authorization: Bearer $(token despachador1)" \
    -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d '{"motivo":"Limpieza del script de prueba"}' \
    && echo "  (servicio $1 cancelado para liberar la unidad)"
}

subir_evidencia() { # subir_evidencia <token chofer> <viajeId> <tipo> <archivo> -> evidenciaId (una parte; la app sube por partes de 5 MB)
  local id tamano r url etag
  id=$(uuidgen | tr '[:upper:]' '[:lower:]'); tamano=$(wc -c < "$4" | tr -d ' ')
  r=$(curl -sf -X POST "$VIAJES/api/v1/viajes/$2/evidencias" -H "Authorization: Bearer $1" -H "Idempotency-Key: $(uuidgen)" \
    -H 'Content-Type: application/json' -d "{\"evidenciaId\":\"$id\",\"tipo\":\"$3\",\"contentType\":\"image/png\",\"tamanoBytes\":$tamano}")
  url=$(echo "$r" | json "d['partes'][0]['url']")
  etag=$(curl -sf -X PUT --data-binary @"$4" "$url" -D - -o /dev/null | tr -d '\r' | sed -n 's/^[Ee][Tt]ag: //p')
  curl -sf -o /dev/null -X POST "$VIAJES/api/v1/viajes/$2/evidencias/$id/completar" -H "Authorization: Bearer $1" \
    -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "{\"partes\":[{\"numero\":1,\"etag\":$(printf '%s' "$etag" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')}]}"
  echo "$id"
}

FLOTA="${FLOTA_URL:-http://localhost:8102}"
usuario_chofer() { # el usuario de Keycloak de cada chofer de la semilla
  case "$1" in "Marco Quispe") echo chofer1 ;; "René Choque") echo chofer2 ;; "Luis Mamani") echo chofer3 ;; *) echo chofer4 ;; esac
}

viaje_en_ruta() { # viaje_en_ruta <tipoCarga> <toneladas> -> "servicioId viajeId usuarioChofer": confirma el Aula como Agroexport e inicia
  local t s r v chofer
  t=$(token agroexport)
  s=$(confirmar "$t" "$(cotizar "$t" $AULA "$1" "$2")" | json "d['servicioId']")
  r=$(esperar "$t" "$s" "d['confirmacionCompleta']" 30); v=$(echo "$r" | json "d['viajeId']")
  chofer=$(usuario_chofer "$(echo "$r" | json "d['choferNombre']")")
  local codigo
  codigo=$(curl -s -o /tmp/inicio.json -w '%{http_code}' -X POST "$VIAJES/api/v1/viajes/$v/inicio" -H "Authorization: Bearer $(token "$chofer")" \
    -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "{\"dispositivoId\":\"$(uuidgen)\",\"iniciadoEn\":\"$(date -u +%FT%TZ)\"}")
  [ "$codigo" = 200 ] || { echo "El inicio respondió $codigo: $(cat /tmp/inicio.json)" >&2; return 1; }
  echo "$s $v $chofer"
}

registrar_entrega() { # registrar_entrega <token chofer> <viajeId> <fotoId> <firmaId> -> código HTTP (cuerpo en /tmp/entrega.json)
  local cuerpo
  cuerpo=$(printf '{"entregaId":"%s","entregadoEn":"%s","posicion":{"lat":-17.7770,"lng":-63.1945},"fotos":["%s"],"firma":{"evidenciaId":"%s","nombreReceptor":"Rosa Pérez"}}' \
    "$(uuidgen | tr '[:upper:]' '[:lower:]')" "$(date -u +%FT%TZ)" "$3" "$4")
  curl -s -o /tmp/entrega.json -w '%{http_code}' -X POST "$VIAJES/api/v1/viajes/$2/entrega" -H "Authorization: Bearer $1" \
    -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' -d "$cuerpo"
}

png_de_prueba() { local f; f=$(mktemp); python3 -c "import sys; sys.stdout.buffer.write(b'\x89PNG\r\n\x1a\n' + bytes(2048))" > "$f"; echo "$f"; }

entregar_en_aula() { # entregar_en_aula <usuarioChofer> <viajeId> -> estado del viaje tras la entrega (con foto y firma, dentro de la geocerca)
  local c img
  c=$(token "$1"); img=$(png_de_prueba)
  registrar_entrega "$c" "$2" "$(subir_evidencia "$c" "$2" FOTO_ENTREGA "$img")" "$(subir_evidencia "$c" "$2" FIRMA "$img")" >/dev/null
  json "d['estado']" < /tmp/entrega.json
}

cola() { # cola <nombre> -> mensajes en la cola (las estadísticas de la consola se actualizan cada 5 s)
  curl -sf -u "$RABBITMQ_ADMIN:$RABBITMQ_ADMIN_CLAVE" "http://localhost:15672/api/queues/%2F/$1" | json "str(d.get('messages', 0))"
}

consumidores() { # consumidores <nombre> -> consumidores conectados a la cola
  curl -sf -u "$RABBITMQ_ADMIN:$RABBITMQ_ADMIN_CLAVE" "http://localhost:15672/api/queues/%2F/$1" | json "str(d.get('consumers', 0))"
}

publicar() { # publicar <claveEnrutamiento> <sobre JSON>: en transporte.events por la API de administración
  curl -sf -u "$RABBITMQ_ADMIN:$RABBITMQ_ADMIN_CLAVE" -H 'content-type: application/json' -X POST \
    "http://localhost:15672/api/exchanges/%2F/transporte.events/publish" \
    -d "{\"routing_key\":\"$1\",\"properties\":{\"content_type\":\"application/json\"},\"payload_encoding\":\"string\",\"payload\":$(printf '%s' "$2" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')}" \
    | json "str(d['routed'])"
}

correos() { curl -sf "http://localhost:8025/api/v1/search?query=$1" | json "str(d['messages_count'])"; }
