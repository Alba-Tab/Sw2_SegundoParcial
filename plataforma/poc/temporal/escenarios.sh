#!/usr/bin/env bash
# PoC-2: escenarios contra el compose levantado (docker compose up -d --build). Sale con 1 si alguno falla.
set -uo pipefail
cd "$(dirname "$0")"
DC="docker compose"
FALLAS=0
ok() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; else printf '  FALLA %s (esperado %s, obtenido %s)\n' "$1" "$3" "$2"; FALLAS=$((FALLAS+1)); fi; }
cli() { $DC run --rm -T cli "$1" 2>/dev/null; }
uuid7() { python3 -I -c 'import uuid; print(uuid.uuid7())'; }
CLIENTE=01933b5a-1f00-7a20-8b11-0c2d3e4f5a01
COTIZACION=01933b60-2a10-7b30-9c22-1d3e4f5a6b01
entrada() { # servicioId clienteId cotizacionId (usa $VIAJE)
  jq -nc --arg s "$1" --arg v "$VIAJE" --arg c "$2" --arg q "$3" \
    '{servicioId:$s, viajeId:$v, clienteId:$c, cotizacionId:$q, canal:"PORTAL", creadoPor:"6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
      parametrosSaga:{esperaAprobacion:"PT24H", compensacion:{scheduleToClose:"PT2M", maximoIntentos:4}}}'; }
iniciar() { # servicioId clienteId cotizacionId; deja el viajeId en $VIAJE
  VIAJE=$(uuid7)
  cli "temporal workflow start --type ProgramarViaje --task-queue viajes --workflow-id programar-viaje-$1 \
    --id-reuse-policy RejectDuplicate --input '$(entrada "$1" "$2" "$3")'" >/dev/null; }
resultado() { cli "temporal workflow result --workflow-id programar-viaje-$1 -o json" | jq -r '.result | "\(.resultado) \(.motivo // "-")"'; }
etapa() { cli "temporal workflow query --workflow-id programar-viaje-$1 --name estado -o json" | jq -r '.queryResult[0].etapa'; }
intentos() { # servicioId tipo-actividad → intentos del último ActivityTaskFailed/Completed
  cli "temporal workflow show --workflow-id programar-viaje-$1 -o json" \
    | jq -r --arg a "$2" '[.events[] | select(.activityTaskScheduledEventAttributes.activityType.name == $a)] | length'; }
veces() { $DC logs --no-log-prefix "$1" 2>/dev/null | grep "ACTIVIDAD $2 viajeId=$VIAJE" | grep -c -F "$3"; }

echo "== E1 camino feliz: Java → PHP → TS → Java (fixtures del contrato)"
S=$(uuid7); iniciar "$S" $CLIENTE $COTIZACION
ok "resultado" "$(resultado "$S")" "CONFIRMADO -"
ok "etapa final" "$(etapa "$S")" TERMINADO
ok "PHP reservó en PostgreSQL" "$($DC exec -T postgres-finanzas psql -U finanzas -tAc "select estado from reservas_credito where servicio_id='$S'")" RESERVADA
ok "Java recibió el resultado de TS y PHP (Jackson 3)" "$(veces viajes Viajes.confirmarViaje 'placa=4521KTR chofer=Juan Mamani Quispe monto=2800.00 BOB fecha=2026-11-03')" 1
# El CLI (SDK de Go) ante AlreadyStarted devuelve el run existente; el SDK de Java lanza WorkflowExecutionAlreadyStarted.
R1=$(cli "temporal workflow describe --workflow-id programar-viaje-$S -o json" | jq -r .workflowExecutionInfo.execution.runId)
R2=$(cli "temporal workflow start --type ProgramarViaje --task-queue viajes --workflow-id programar-viaje-$S --id-reuse-policy RejectDuplicate --input '$(entrada "$S" $CLIENTE $COTIZACION)'" | awk '/RunId/{print $2}')
ok "D43: segundo start devuelve el mismo run" "$R2" "$R1"
ok "D43: una sola ejecución con ese workflowId" "$(cli "temporal workflow count --query \"WorkflowId='programar-viaje-$S'\"" | awk '{print $NF}')" 1

echo "== E2 FS2: CREDITO_INSUFICIENTE desde PHP (no reintentable, details cruzan lenguajes)"
S=$(uuid7); iniciar "$S" 0193a000-0000-7000-8000-0000000c0003 $COTIZACION
ok "resultado" "$(resultado "$S")" "CANCELADO CREDITO_INSUFICIENTE"
ok "un solo intento de validarYReservarCredito" "$(intentos "$S" Finanzas.validarYReservarCredito)" 1
ok "Viajes.cancelarViaje recibe el mensaje de DetalleFallo de PHP" "$(veces viajes Viajes.cancelarViaje 'motivo=CREDITO_INSUFICIENTE detalle="El disponible es 5000.00 BOB y el servicio cuesta 7600.00 BOB"')" 1

echo "== E3 FS4: SIN_UNIDAD_COMPATIBLE desde TS → compensación en orden inverso (PHP y Java)"
S=$(uuid7); iniciar "$S" $CLIENTE 0193a000-0000-7000-8000-0000000d0004
ok "resultado" "$(resultado "$S")" "CANCELADO SIN_UNIDAD_COMPATIBLE"
ok "crédito liberado en PHP" "$($DC exec -T postgres-finanzas psql -U finanzas -tAc "select estado||' '||motivo_liberacion from reservas_credito where servicio_id='$S'")" "LIBERADA SIN_UNIDAD_COMPATIBLE"
ok "viaje cancelado en Java" "$(veces viajes Viajes.cancelarViaje "motivo=SIN_UNIDAD_COMPATIBLE")" 1

echo "== E4 FS5: worker de Flota apagado → espera y continúa"
$DC stop flota >/dev/null 2>&1
S=$(uuid7); iniciar "$S" $CLIENTE $COTIZACION; sleep 5
ok "espera en el paso 3" "$(etapa "$S")" RESERVANDO_UNIDAD
$DC start flota >/dev/null 2>&1
ok "continúa al volver Flota" "$(resultado "$S")" "CONFIRMADO -"

echo "== E5 FS6: Flota y Viajes caídos a la mitad → retoma sin duplicar"
$DC stop flota >/dev/null 2>&1
S=$(uuid7); iniciar "$S" $CLIENTE $COTIZACION; sleep 5
V=$(echo "$S" | cut -c1-8)
$DC stop viajes >/dev/null 2>&1; $DC start flota >/dev/null 2>&1; sleep 5; $DC start viajes >/dev/null 2>&1
ok "resultado" "$(resultado "$S")" "CONFIRMADO -"
VI=$(cli "temporal workflow show --workflow-id programar-viaje-$S -o json" | jq -r '[.events[] | select(.activityTaskScheduledEventAttributes.activityType.name == "Viajes.crearViaje")] | length')
ok "crearViaje programado una sola vez" "$VI" 1
ok "reservarUnidad programado una sola vez" "$(intentos "$S" Flota.reservarUnidad)" 1

echo "== E6 Laravel: se reinicia PostgreSQL de Finanzas sin tocar el worker"
$DC restart postgres-finanzas >/dev/null 2>&1; sleep 4
S=$(uuid7); iniciar "$S" $CLIENTE $COTIZACION
ok "resultado tras el reinicio de la base" "$(resultado "$S")" "CONFIRMADO -"
ok "intentos de validarYReservarCredito" "$(cli "temporal workflow show --workflow-id programar-viaje-$S -o json" | jq -r '[.events[] | select(.activityTaskStartedEventAttributes)] | .[1].activityTaskStartedEventAttributes.attempt')" 1
ok "outbox:publicar se recupera solo" "$($DC logs --since 15s finanzas 2>/dev/null | grep -c 'outbox:publicar ok' | awk '{print ($1>0)?"si":"no"}')" si

echo "== E7 RoadRunner: plugin service reinicia eventos:consumir y un worker PHP muerto"
P1=$($DC logs finanzas 2>/dev/null | grep -o 'eventos:consumir iniciado pid=[0-9]*' | tail -1)
$DC exec -T finanzas touch /tmp/matar-eventos; sleep 5
P2=$($DC logs finanzas 2>/dev/null | grep -o 'eventos:consumir iniciado pid=[0-9]*' | tail -1)
ok "eventos:consumir reiniciado con otro pid" "$([ "$P1" != "$P2" ] && [ -n "$P2" ] && echo si || echo no)" si
contar_php() { $DC exec -T finanzas sh -c 'for p in /proc/[0-9]*; do tr "\0" " " < $p/cmdline 2>/dev/null | grep -q "^php worker.php" && echo x; done' | grep -c x; }
ANTES=$(contar_php)
PID=$($DC exec -T finanzas sh -c 'for p in /proc/[0-9]*; do tr "\0" " " < $p/cmdline 2>/dev/null | grep -q "^php worker.php" && echo ${p#/proc/}; done | head -1')
[ -n "$PID" ] && $DC exec -T finanzas sh -c "kill -9 $PID"; sleep 3
ok "se mató un worker PHP" "$($DC exec -T finanzas sh -c "[ -d /proc/$PID ] && echo vivo || echo muerto")" muerto
ok "RoadRunner repone el worker PHP muerto (1 de workflows + 2 de actividades)" "$(contar_php)" "$ANTES"
S=$(uuid7); iniciar "$S" $CLIENTE $COTIZACION
ok "saga completa tras matar un worker PHP" "$(resultado "$S")" "CONFIRMADO -"

echo; if [ $FALLAS -eq 0 ]; then echo "PoC-2 OK"; else echo "$FALLAS pruebas fallaron"; exit 1; fi
