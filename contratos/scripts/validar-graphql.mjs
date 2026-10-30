// Compila contratos/graphql/*.graphql con graphql-js: el esquema del Gateway tiene que ser válido (spec 016).
import { readFileSync, readdirSync } from 'node:fs';
import { buildSchema } from 'graphql';

const carpeta = new URL('../graphql/', import.meta.url);
for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith('.graphql'))) {
  const esquema = buildSchema(readFileSync(new URL(archivo, carpeta), 'utf8'));
  const tipos = Object.keys(esquema.getTypeMap()).filter((t) => !t.startsWith('__')).length;
  const mutaciones = Object.keys(esquema.getMutationType()?.getFields() ?? {});
  const sinClave = mutaciones.filter((m) => {
    const campo = esquema.getMutationType().getFields()[m];
    const tieneClave = campo.args.some(
      (a) => a.name === 'claveIdempotencia' || (a.name === 'input' && 'claveIdempotencia' in (a.type.ofType ?? a.type).getFields?.()),
    );
    return !tieneClave && m !== 'preguntar';
  });
  if (sinClave.length) throw new Error(`${archivo}: mutaciones sin claveIdempotencia: ${sinClave.join(', ')}`);
  console.log(`✓ ${archivo} válido: ${tipos} tipos, ${mutaciones.length} mutaciones con claveIdempotencia`);
}
