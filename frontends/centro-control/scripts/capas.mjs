// Capas por feature (AGENTS.md: "Por feature: domain/, data/, ui/. Fachada sobre Signals, repositorio sobre Apollo").
// Como ArchUnit en Viajes o dependency-cruiser en Flota, falla si una capa importa lo que no le toca:
//   - domain/: tipos y reglas puras; ni Angular, ni Apollo, ni rxjs, ni otras capas; del código generado, solo `import type`;
//     de ui-comun, solo los ayudantes puros de dinero y fechas.
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
    nombres: m[2].replace(/[{}]/g, '').split(',').map((n) => n.trim().replace(/^type\s+/, '')).filter(Boolean),
    desde: m[3],
  }));

/** Lo de ui-comun que es puro (dinero en centavos, fechas de La Paz) y por eso puede usar el dominio. */
const PUROS_DE_UI_COMUN = new Set(['aCentavos', 'desdeCentavos', 'sumarMontos', 'fechaLaPaz', 'pct']);

const reglas = {
  domain: ({ soloTipos, nombres, desde }) =>
    desde === 'ui-comun' && !soloTipos && nombres.some((n) => !PUROS_DE_UI_COMUN.has(n))
      ? `domain/ solo usa de ui-comun lo puro (${[...PUROS_DE_UI_COMUN].join(', ')})`
      : /^(@angular|apollo-angular|@apollo|rxjs)/.test(desde)
        ? 'domain/ no importa frameworks'
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
