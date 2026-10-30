// D101: el Gateway rechaza con CONSULTA_DEMASIADO_COMPLEJA toda operación de complejidad mayor que 1.000. Este script
// cuenta cada operación de projects/*/src/**/*.graphql contra contratos/graphql/centro-control.graphql con la misma
// regla del Gateway (servicios/gateway/src/graphql/limites.ts) y falla si alguna se pasa:
//   - cada campo vale 1 más lo de adentro;
//   - una lista con argumento `limite` vale 1 + limite × max(1, lo de adentro), con limite acotado a 1–100 (sin
//     valor: el valor por defecto del esquema, o 20; una variable cuenta como 100, el peor caso);
//   - Apollo agrega `__typename` a cada selección (objeto o fragmento), y también vale 1.
// Da lo mismo que graphql-query-complexity con esa regla. Uso: node scripts/complejidad.mjs (corre en npm run verificar).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchema, getNamedType, isCompositeType, isListType, isNonNullType, Kind, parse } from 'graphql';

const MAXIMO = 1000;
const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 100;

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const esquema = buildSchema(readFileSync(join(raiz, '../../contratos/graphql/centro-control.graphql'), 'utf8'));

const archivos = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? archivos(join(dir, e.name)) : e.name.endsWith('.graphql') ? [join(dir, e.name)] : [],
  );

const esLista = (tipo) => isListType(isNonNullType(tipo) ? tipo.ofType : tipo);

function limiteContado(campo, nodo) {
  const arg = nodo.arguments?.find((a) => a.name.value === 'limite');
  let n;
  if (arg?.value.kind === Kind.INT) n = Number(arg.value.value);
  else if (arg?.value.kind === Kind.VARIABLE) n = LIMITE_MAXIMO;
  else n = Number(campo.args.find((a) => a.name === 'limite')?.defaultValue ?? LIMITE_POR_DEFECTO);
  return Math.max(1, Math.min(LIMITE_MAXIMO, Math.trunc(n)));
}

// Apollo agrega `__typename` a cada selección que no sea la raíz de la operación: la de cada campo objeto, la de cada
// fragmento y la de cada fragmento en línea. Por eso `campo { ...Fragmento }` cuenta dos `__typename` por fila.
function complejidad(seleccion, tipo, fragmentos, vistos = new Set(), raiz = false) {
  let total = 0;
  let conTypename = false;
  for (const s of seleccion.selections) {
    if (s.kind === Kind.FRAGMENT_SPREAD) {
      if (vistos.has(s.name.value)) continue;
      const f = fragmentos.get(s.name.value);
      total += complejidad(f.selectionSet, esquema.getType(f.typeCondition.name.value), fragmentos, new Set([...vistos, s.name.value]));
      continue;
    }
    if (s.kind === Kind.INLINE_FRAGMENT) {
      const t = s.typeCondition ? esquema.getType(s.typeCondition.name.value) : tipo;
      total += complejidad(s.selectionSet, t, fragmentos, vistos);
      continue;
    }
    if (s.name.value === '__typename') {
      conTypename = true;
      total += 1;
      continue;
    }
    const campo = tipo.getFields()[s.name.value];
    if (!campo) throw new Error(`${tipo.name}.${s.name.value} no existe en el esquema`);
    const interno =
      isCompositeType(getNamedType(campo.type)) && s.selectionSet
        ? complejidad(s.selectionSet, getNamedType(campo.type), fragmentos, vistos)
        : 0;
    const conLimite = esLista(campo.type) && campo.args.some((a) => a.name === 'limite');
    total += conLimite ? 1 + limiteContado(campo, s) * Math.max(1, interno) : 1 + interno;
  }
  return raiz || conTypename ? total : total + 1;
}

let fallas = 0;
const filas = [];
for (const proyecto of readdirSync(join(raiz, 'projects'))) {
  const docs = archivos(join(raiz, 'projects', proyecto, 'src')).map((a) => [a, parse(readFileSync(a, 'utf8'))]);
  const fragmentos = new Map(
    docs.flatMap(([, d]) => d.definitions.filter((x) => x.kind === Kind.FRAGMENT_DEFINITION).map((x) => [x.name.value, x])),
  );
  for (const [archivo, doc] of docs) {
    for (const op of doc.definitions.filter((x) => x.kind === Kind.OPERATION_DEFINITION)) {
      const tipo = esquema.getRootType(op.operation);
      const total = complejidad(op.selectionSet, tipo, fragmentos, new Set(), true);
      if (total > MAXIMO) fallas++;
      filas.push(`${total > MAXIMO ? '✘' : '✔'} ${String(total).padStart(5)}  ${op.name?.value ?? '(anónima)'}  ${relative(raiz, archivo)}`);
    }
  }
}
console.log(filas.join('\n'));
if (fallas) {
  console.error(`\n${fallas} operación(es) pasan la complejidad máxima de ${MAXIMO} (D101): baja el limite o pagina con cursor.`);
  process.exit(1);
}
console.log(`\nTodas las operaciones quedan en ${MAXIMO} o menos (D101).`);
