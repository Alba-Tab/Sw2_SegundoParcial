// Carga todos los *.schema.json de contratos/, los compila juntos (resuelven $ref entre sí)
// y valida cada ejemplo (`examples`) contra su esquema o contra su $defs.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const raiz = fileURLToPath(new URL('..', import.meta.url));

function buscarEsquemas(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === 'node_modules') return [];
    if (statSync(ruta).isDirectory()) return buscarEsquemas(ruta);
    return nombre.endsWith('.schema.json') ? [ruta] : [];
  });
}

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
addFormats(ajv);

const esquemas = buscarEsquemas(raiz).map((ruta) => ({ ruta, esquema: JSON.parse(readFileSync(ruta, 'utf8')) }));
for (const { ruta, esquema } of esquemas) {
  if (!esquema.$id) throw new Error(`${relative(raiz, ruta)} no tiene $id`);
  ajv.addSchema(esquema);
}

let ejemplos = 0;
const fallos = [];
function validar(ref, lista, donde) {
  const validador = ajv.getSchema(ref);
  if (!validador) throw new Error(`No se pudo compilar ${ref}`);
  for (const [i, ejemplo] of (lista ?? []).entries()) {
    ejemplos += 1;
    if (!validador(ejemplo)) fallos.push(`${donde} ejemplo ${i}: ${ajv.errorsText(validador.errors)}`);
  }
}

for (const { ruta, esquema } of esquemas) {
  const archivo = relative(raiz, ruta);
  validar(esquema.$id, esquema.examples, archivo);
  for (const [nombre, def] of Object.entries(esquema.$defs ?? {})) {
    validar(`${esquema.$id}#/$defs/${nombre}`, def.examples, `${archivo}#${nombre}`);
  }
}

if (fallos.length) {
  console.error(`✗ ${fallos.length} ejemplo(s) no cumplen su esquema:\n  ${fallos.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${esquemas.length} esquemas compilados y ${ejemplos} ejemplos válidos`);
