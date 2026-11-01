// Prueba de la verificación de iconos (revisión E-8): `node --test scripts/iconos.test.mjs`, dentro de `npm run iconos`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faltantes, iconosEn, leerLista } from './iconos.mjs';

test('ve cada forma en que se escribe un icono', () => {
  const texto = `
    <mat-icon>home</mat-icon>
    <mat-icon aria-hidden="true">check</mat-icon
    >Guardar
    <mat-icon>{{ abierto ? 'expand_less' : 'expand_more' }}</mat-icon
    >
    <cc-confirmacion [icono]="'block'" />
    <cc-boton icono="send" />
    const e = { icono: 'warning' };
    e('Listo', 'done');`;
  assert.deepEqual([...iconosEn(texto)].sort(), ['block', 'check', 'done', 'expand_less', 'expand_more', 'home', 'send', 'warning']);
});

test('falla con un icono fuera de la lista, en cualquier forma', () => {
  const lista = leerLista();
  const textos = {
    'a.ts': `<mat-icon>${lista[0]}</mat-icon>`,
    'b.ts': '<mat-icon>icono_inventado</mat-icon\n>',
    'c.ts': `<cc-confirmacion [icono]="'otro_inventado'" />`,
  };
  assert.deepEqual(faltantes(textos, lista), ['b.ts: icono_inventado', 'c.ts: otro_inventado']);
});
