// Capas por feature (AGENTS.md: "Por feature: domain/, data/, ui/. Fachada sobre Signals, repositorio sobre Apollo").
// Como ArchUnit en Viajes o dependency-cruiser en Flota, falla si una capa importa lo que no le toca:
//   - domain/: tipos y reglas puras; ni Angular, ni Apollo, ni rxjs, ni otras capas; del código generado, solo `import type`;
//     de ui-comun, solo el punto de entrada puro `ui-comun/dominio` (el índice `ui-comun` carga Angular; de él, solo tipos).
//   - ui-comun/dominio/: ese punto de entrada; no importa frameworks ni el resto de ui-comun.
//   - ui/: consume la fachada; no importa los servicios generados (*GQL) ni Apollo; del generado, solo `import type`.
//   - data/: el repositorio; no importa ui/ ni fachadas.
// Uso: node scripts/capas.mjs (corre en npm run verificar).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivos = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? archivos(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [join(dir, e.name)] : [],
  );
const importaciones = (texto) =>
  [...texto.matchAll(/^import\s+(type\s+)?([^'"]*?)\s*from\s+'([^']+)';/gms)].map((m) => ({
    soloTipos: !!m[1],
    desde: m[3],
  }));

const FRAMEWORKS = /^(@angular|apollo-angular|@apollo|rxjs|oidc-client-ts|graphql)/;

const reglas = {
  domain: ({ soloTipos, desde }) =>
    desde === 'ui-comun' && !soloTipos
      ? "domain/ no importa el índice de ui-comun, que carga Angular: usa 'ui-comun/dominio'"
      : FRAMEWORKS.test(desde)
        ? 'domain/ no importa frameworks'
        : /\/(ui|data)\//.test(desde) || /\.fachada$/.test(desde)
          ? 'domain/ no importa otras capas'
          : /graphql\/generado$/.test(desde) && !soloTipos
            ? 'domain/ solo importa tipos del código generado'
            : null,
  // projects/ui-comun/dominio/: lo puro de ui-comun, que importa la capa domain/ de cada app.
  dominio: ({ desde }) =>
    FRAMEWORKS.test(desde)
      ? 'ui-comun/dominio no importa frameworks'
      : /^ui-comun/.test(desde) || /^\.\.\//.test(desde)
        ? 'ui-comun/dominio no importa el resto de ui-comun'
        : null,
  ui: ({ soloTipos, desde }) =>
    /^(apollo-angular|@apollo)/.test(desde)
      ? 'ui/ no usa Apollo: lo hace el repositorio'
      : /\/data\//.test(desde)
        ? 'ui/ no usa el repositorio: usa la fachada'
        : /graphql\/generado$/.test(desde) && !soloTipos
          ? 'ui/ no inyecta los servicios generados (*GQL): usa la fachada'
          : null,
  data: ({ desde }) => (/\/ui\//.test(desde) || /\.fachada$/.test(desde) ? 'data/ no importa ui/ ni fachadas' : null),
};

const fallas = [];
for (const archivo of archivos(join(raiz, 'projects'))) {
  const capa = relative(raiz, archivo).split(sep).find((p) => p in reglas);
  if (!capa) continue;
  for (const imp of importaciones(readFileSync(archivo, 'utf8'))) {
    const falla = reglas[capa](imp);
    if (falla) fallas.push(`${relative(raiz, archivo)}: '${imp.desde}' (${falla})`);
  }
}
if (fallas.length) {
  console.error(fallas.join('\n'));
  process.exit(1);
}
console.log('Capas por feature en orden (domain/, data/, ui/) y ui-comun/dominio sin frameworks.');
