// Lista cerrada de iconos (revisión A-1). La fuente Material Symbols completa pesa 4 MB; las apps usan unos 80 glifos.
//
//   node scripts/iconos.mjs            verifica: todo icono usado en el código está en ICONOS y la fuente se generó
//                                      con esa misma lista. Corre en `npm run probar`, sin herramientas externas.
//   node scripts/iconos.mjs --generar  recorta la fuente: solo los glifos de ICONOS, estilo outlined, peso 400 sin
//                                      relleno, a WOFF. Necesita `hb-subset` de HarfBuzz (brew install harfbuzz).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { deflateSync } from 'node:zlib';

const raiz = new URL('..', import.meta.url).pathname;
const ARCHIVO_LISTA = join(raiz, 'projects/ui-comun/dominio/src/iconos.ts');
const ESTILOS = join(raiz, 'projects/ui-comun/src/estilos');
const FUENTE = join(raiz, 'node_modules/material-symbols/material-symbols-outlined.woff2');

export function leerLista(texto = readFileSync(ARCHIVO_LISTA, 'utf8')) {
  const cuerpo = texto.split('ICONOS = [')[1]?.split(']')[0] ?? '';
  return [...cuerpo.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

/**
 * Los nombres de icono escritos en un archivo fuente: en `<mat-icon>` (también con el cierre que Prettier parte en
 * `</mat-icon\n>`), en `icono: '…'`, `icono="…"` o `[icono]="'…'"` y en las etiquetas `e('…', '…')`.
 */
export function iconosEn(texto) {
  const usados = new Set();
  for (const [, nombre] of texto.matchAll(/<mat-icon[^>]*>\s*([a-z0-9_]+)\s*<\/mat-icon\s*>/g)) usados.add(nombre);
  for (const [, expr] of texto.matchAll(/<mat-icon[^>]*>\s*\{\{([^}]*)\}\}\s*<\/mat-icon\s*>/g))
    for (const [, nombre] of expr.matchAll(/'([a-z0-9_]+)'/g)) usados.add(nombre);
  for (const [, nombre] of texto.matchAll(/\bicono:\s*'([a-z0-9_]+)'/g)) usados.add(nombre);
  for (const [, nombre] of texto.matchAll(/\sicono="([a-z0-9_]+)"/g)) usados.add(nombre);
  for (const [, nombre] of texto.matchAll(/\[icono\]="'([a-z0-9_]+)'"/g)) usados.add(nombre);
  for (const [, nombre] of texto.matchAll(/\be\('[^']*',\s*'([a-z0-9_]+)'/g)) usados.add(nombre);
  return usados;
}

function fuentes(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'generado.ts' && n !== 'iconos.ts' ? [ruta] : [];
  });
}

const firma = (lista) =>
  createHash('sha256')
    .update([...lista].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);

/** WOFF 1.0: cada tabla del TTF comprimida con zlib (la especificación del W3C, sin dependencias). */
function aWoff(ttf) {
  const n = ttf.readUInt16BE(4);
  const directorio = Buffer.alloc(20 * n);
  const datos = [];
  let pos = 44 + 20 * n;
  let tamanoSfnt = 12 + 16 * n;
  for (let i = 0; i < n; i++) {
    const o = 12 + 16 * i;
    const [inicio, largo] = [ttf.readUInt32BE(o + 8), ttf.readUInt32BE(o + 12)];
    const crudo = ttf.subarray(inicio, inicio + largo);
    const comprimido = deflateSync(crudo, { level: 9 });
    const tabla = comprimido.length < crudo.length ? comprimido : crudo;
    ttf.copy(directorio, 20 * i, o, o + 4);
    directorio.writeUInt32BE(pos, 20 * i + 4);
    directorio.writeUInt32BE(tabla.length, 20 * i + 8);
    directorio.writeUInt32BE(largo, 20 * i + 12);
    directorio.writeUInt32BE(ttf.readUInt32BE(o + 4), 20 * i + 16);
    const relleno = (4 - (tabla.length % 4)) % 4;
    datos.push(tabla, Buffer.alloc(relleno));
    pos += tabla.length + relleno;
    tamanoSfnt += largo + ((4 - (largo % 4)) % 4);
  }
  const cabecera = Buffer.alloc(44);
  cabecera.write('wOFF', 0, 'latin1');
  cabecera.writeUInt32BE(ttf.readUInt32BE(0), 4);
  cabecera.writeUInt32BE(pos, 8);
  cabecera.writeUInt16BE(n, 12);
  cabecera.writeUInt32BE(tamanoSfnt, 16);
  cabecera.writeUInt16BE(1, 20);
  return Buffer.concat([cabecera, directorio, ...datos]);
}

function css(lista) {
  return `/*
 * GENERADO por scripts/iconos.mjs --generar; no se edita a mano. lista ${firma(lista)}
 * Material Symbols Outlined recortada a la lista cerrada de ui-comun/dominio/src/iconos.ts (${lista.length} glifos),
 * peso 400, sin relleno, grado 0 y tamaño óptico 24. font-display: block oculta el glifo mientras carga (unos 3 s
 * como máximo, luego el navegador lo muestra igual), así nunca se lee el nombre ni se queda oculto toda la sesión.
 */
@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('./material-symbols-outlined.woff') format('woff');
}
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'liga';
}
`;
}

function generar(lista) {
  const tmp = mkdtempSync(join(tmpdir(), 'iconos-'));
  const ttf = join(tmp, 'recorte.ttf');
  // FreeType lee el woff2; sin cierre de GSUB solo quedan las ligaduras de los glifos pedidos, no las 3 900.
  execFileSync('hb-subset', [
    '--face-loader=ft',
    FUENTE,
    `--glyphs=${lista.join(',')}`,
    '--text=abcdefghijklmnopqrstuvwxyz0123456789_',
    '--no-layout-closure',
    '--layout-features=*',
    '--variations=FILL=0 wght=400 GRAD=0 opsz=24',
    '-o',
    ttf,
  ]);
  const woff = aWoff(readFileSync(ttf));
  writeFileSync(join(ESTILOS, 'material-symbols-outlined.woff'), woff);
  writeFileSync(join(ESTILOS, 'iconos.css'), css(lista));
  console.log(`Fuente recortada: ${statSync(FUENTE).size} → ${woff.length} bytes (${lista.length} glifos)`);
}

/** `archivo: icono` por cada icono usado en `textos` ({ ruta: contenido }) que no está en `lista`. */
export function faltantes(textos, lista) {
  const enLista = new Set(lista);
  return Object.entries(textos).flatMap(([archivo, texto]) =>
    [...iconosEn(texto)].filter((i) => !enLista.has(i)).map((i) => `${archivo}: ${i}`),
  );
}

function verificar(lista) {
  const faltan = faltantes(
    Object.fromEntries(fuentes(join(raiz, 'projects')).map((a) => [relative(raiz, a), readFileSync(a, 'utf8')])),
    lista,
  );
  const generado = readFileSync(join(ESTILOS, 'iconos.css'), 'utf8').match(/lista ([0-9a-f]{16})/)?.[1];
  const errores = [
    ...faltan.map((f) => `Icono fuera de la lista cerrada (agrégalo a iconos.ts y corre npm run iconos:generar): ${f}`),
    ...(generado === firma(lista) ? [] : ['La fuente de iconos no corresponde a iconos.ts: corre npm run iconos:generar']),
  ];
  for (const e of errores) console.error(e);
  if (errores.length) process.exit(1);
  console.log(`Iconos: ${lista.length} en la lista, todos los usados están incluidos.`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--generar')) generar(leerLista());
  else if (process.argv.includes('--usados')) {
    const todos = new Set(fuentes(join(raiz, 'projects')).flatMap((a) => [...iconosEn(readFileSync(a, 'utf8'))]));
    console.log([...todos].sort().join('\n'));
  } else verificar(leerLista());
}
