// Capas por feature (AGENTS.md: "Por feature: domain/, data/, ui/. Fachada sobre Signals, repositorio sobre Apollo").
// Como ArchUnit en Viajes o dependency-cruiser en Flota, falla si una capa importa lo que no le toca:
//   - domain/: tipos y reglas puras; ni Angular, ni Apollo, ni rxjs, ni otras capas; del código generado, solo `import type`.
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
  [...texto.matchAll(/^import\s+(type\s+)?[^'"]*?from\s+'([^']+)';/gms)].map((m) => ({ soloTipos: !!m[1], desde: m[2] }));

const reglas = {
  domain: ({ soloTipos, desde }) =>
    /^(@angular|apollo-angular|@apollo|rxjs|ui-comun)/.test(desde)
      ? 'domain/ no importa frameworks ni ui-comun'
      : /\/(ui|data)\//.test(desde) || /\.fachada$/.test(desde)
        ? 'domain/ no importa otras capas'
        : /graphql\/generado$/.test(desde) && !soloTipos
          ? 'domain/ solo importa tipos del código generado'
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
console.log('Capas por feature en orden (domain/, data/, ui/).');
