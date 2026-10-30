# n8n

Avisos por correo sin reglas de negocio: todo lo que el correo necesita viene en el evento (spec 006).

| Flujo | Cola | Qué hace |
|---|---|---|
| `flujos/factura-emitida.json` | `n8n.eventos` (`finanzas.factura-emitida.v1` y `analitica.aviso-cliente-aprobado.v1`) | Es el único consumidor de la cola. Un `Switch` por `tipo` manda `AvisoClienteAprobado` al subflujo `aviso-cliente` y espera a que termine. Con `FacturaEmitida`, busca el `eventId` en `n8n_inbox`; si es nuevo, envía "Factura FAC-… por 2.800,00 BOB" con el enlace al portal y **después** registra el `eventId` (D63: "al menos una vez"; si n8n cae entre los dos pasos puede repetir ese correo) |
| `flujos/aviso-cliente.json` | Subflujo (lo llama `factura-emitida`) | Spec 014: el aviso de retraso que aprobó el despachador. Usa la misma regla del Inbox. El asunto, el destinatario (la copia `cliente` de Analítica) y el mensaje vienen en el evento |

- **Acuse:** el disparador de RabbitMQ confirma el mensaje solo si la ejecución termina bien, y procesa uno a la vez (`parallelMessages: 1`). Con mensajes en paralelo, dos copias del mismo evento pasaban la consulta del Inbox antes de que se registrara la primera. Si el SMTP falla, el mensaje vuelve a la cola, y después de `x-delivery-limit = 5` va a `n8n.eventos.dlq`.
- **Topología:** no declara la cola (`assertQueue: false`). La cola es de quórum y la crea la topología de `plataforma/compose/rabbitmq`. El usuario `n8n` no tiene permiso de `configure`.
- **Arranque en el compose:**
  - `n8n-inbox` crea la tabla `n8n_inbox`.
  - `n8n-importar` (`importar.sh`) importa las credenciales y los flujos, y los publica. Las credenciales se arman desde el entorno, así que no hay secretos en el repo. Las tres son RabbitMQ (usuario `n8n`), PostgreSQL y SMTP (Mailpit en local; D37 en la nube).
  - Recién después arranca `n8n`.
- **Limitación conocida (encontrada con FC5):** si RabbitMQ se cae, el disparador de RabbitMQ de n8n 2.46 no se reconecta y n8n despublica el flujo. Los mensajes esperan en `n8n.eventos`; `scripts/fallos/encender-rabbitmq.sh` vuelve a publicar con el importador y reinicia n8n, que procesa lo pendiente. En la nube el broker no se reinicia salvo un despliegue, y ese despliegue reinicia también n8n.
- **Por qué un solo consumidor:** dos flujos con disparador sobre `n8n.eventos` se reparten los mensajes, y cada uno descartaría los del otro.
- **Probar FC2:** se publica dos veces el mismo `FacturaEmitida` en `transporte.events`, y Mailpit (http://localhost:8025) queda con un solo correo.
- Para cambiar un flujo, se exporta desde la UI (`n8n export:workflow --id=…`) y se reemplaza el JSON. El `id` debe quedar igual.
