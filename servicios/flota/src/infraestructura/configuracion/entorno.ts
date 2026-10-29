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
});
export type Entorno = z.infer<typeof esquema>;
export const entorno = (fuente: NodeJS.ProcessEnv = process.env): Entorno => esquema.parse(fuente);
export const AUDIENCIA = 'flota';
