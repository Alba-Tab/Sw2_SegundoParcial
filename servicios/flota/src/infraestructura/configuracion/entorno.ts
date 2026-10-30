import { z } from 'zod';

/** Variables de entorno (000 §11), validadas al arrancar. Valores locales en .env.example. */
const esquema = z.object({
  PORT: z.coerce.number().default(8102),
  MONGO_URI: z.string().default('mongodb://localhost:27017/flota?replicaSet=rs0&directConnection=true'),
  AMQP_URL: z.string().default('amqp://flota:flota@localhost:5672'),
  OIDC_ISSUER: z.string().default(''),
  CORS_ORIGENES: z.string().default(''),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(''),
  OUTBOX_INTERVALO_MS: z.coerce.number().default(1000),
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  /** contratos/eventos y contratos/comun copiados en la imagen: el Outbox valida cada evento (000 §6). */
  CONTRATOS_DIR: z.string().default('/app/contratos'),
  /** plataforma/semilla copiada en la imagen (D102). */
  SEMILLA_DIR: z.string().default('/app/semilla'),
  CONSUMIR_EVENTOS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  TEMPORAL_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type Entorno = z.infer<typeof esquema>;
export const entorno = (fuente: NodeJS.ProcessEnv = process.env): Entorno => esquema.parse(fuente);
export const AUDIENCIA = 'flota';
