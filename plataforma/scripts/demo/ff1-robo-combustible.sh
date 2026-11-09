#!/usr/bin/env bash
# FF1 (spec 009, H5 hasta el evento): el simulador en escenario robo deja un solo CaidaCombustibleDetectada con
# caidaPct >= 8 y velocidad 0. Por defecto lee cada 1 s (9 lecturas); INTERVALO=10 usa el ritmo real (90 s).
. "$(dirname "$0")/comun.sh"
PLACA=${1:-4521KTR}
caidas() { # caidas [js]: cuenta los CaidaCombustibleDetectada de la placa en el Outbox de Flota, o evalúa js sobre ellos
  dc exec -T mongo mongosh --quiet flota --eval \
    "const c = db.outboxEventos.find({tipo: 'CaidaCombustibleDetectada', 'sobre.datos.placa': '$PLACA'}); ${1:-c.count()}"
}
ANTES=$(caidas)

paso "Simulador en escenario robo para $PLACA"
dc --profile simulador run --rm --no-deps --build simulador-combustible \
  --placa "$PLACA" --escenario robo --lecturas 9 --intervalo "${INTERVALO:-1}"

for _ in $(seq 1 10); do [ "$(caidas)" -gt "$ANTES" ] && break; sleep 1; done
esperado "CaidaCombustibleDetectada nuevos" "$(( $(caidas) - ANTES ))" 1
D=$(caidas "const e = c.sort({_id: -1}).next(); JSON.stringify({...e.sobre.datos, publicado: !!e.publicadoEn})")
esperado "caída de 8 puntos o más" "$(echo "$D" | json "str(d['caidaPct'] >= 8)")" True
esperado "velocidad" "$(echo "$D" | json "str(d['velocidadKmh'])")" 0
esperado "publicado en transporte.events" "$(echo "$D" | json "str(d['publicado'])")" True
