import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import formatos from 'ajv-formats';
import { lectura, siguiente } from '../escenarios.mjs';

function serie(escenario, n, nivel) {
  const r = [];
  for (let i = 0; i < n; i++) {
    const s = siguiente(escenario, i, nivel);
    nivel = s.nivelPct;
    r.push(s);
  }
  return r;
}

test('robo: una lectura en marcha, la referencia detenida y 12 puntos en 60 s', () => {
  const s = serie('robo', 9, 50);
  assert.deepEqual(
    s.map((x) => [x.nivelPct, x.velocidadKmh]),
    [[50, 65], [50, 0], [48, 0], [46, 0], [44, 0], [42, 0], [40, 0], [38, 0], [37.95, 65]],
  );
});

test('normal: baja 0,05 en marcha y queda estable detenido; nunca cae 8 puntos detenido', () => {
  const s = serie('normal', 36 * 5, 62);
  assert.equal(s[0].nivelPct, 61.95);
  const detenidas = s.slice(30, 36);
  assert.ok(detenidas.every((x) => x.velocidadKmh === 0 && x.nivelPct === s[29].nivelPct));
  assert.ok(s.at(-1).nivelPct > 50);
});

test('la lectura cumple LecturaSensorCombustible.v1', () => {
  const raiz = new URL('../../../contratos/', import.meta.url);
  const ajv = new Ajv({ strict: false });
  formatos(ajv);
  ajv.addSchema(JSON.parse(readFileSync(new URL('comun/tipos.schema.json', raiz))));
  const valida = ajv.compile(JSON.parse(readFileSync(new URL('eventos/flota/LecturaSensorCombustible.v1.schema.json', raiz))));
  const m = lectura('4521KTR', 600, siguiente('robo', 3, 46), new Date('2026-11-03T14:01:50Z'));
  assert.ok(valida(m), JSON.stringify(valida.errors));
  assert.deepEqual(m, { placa: '4521KTR', nivelPct: 44, capacidadLitros: 600, velocidadKmh: 0, medidoEn: '2026-11-03T14:01:50.000Z' });
});
