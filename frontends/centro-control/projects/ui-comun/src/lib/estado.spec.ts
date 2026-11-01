import { TestBed } from '@angular/core/testing';
import { ETIQUETAS, etiqueta } from 'ui-comun/dominio';
import esquema from '../../../../../../contratos/graphql/centro-control.graphql' with { loader: 'text' };
import analitica from '../../../../../../contratos/openapi/analitica.yaml' with { loader: 'text' };
import comun from '../../../../../../contratos/openapi/comun.yaml' with { loader: 'text' };
import finanzas from '../../../../../../contratos/openapi/finanzas.yaml' with { loader: 'text' };
import flota from '../../../../../../contratos/openapi/flota.yaml' with { loader: 'text' };
import viajes from '../../../../../../contratos/openapi/viajes.yaml' with { loader: 'text' };
import { Estado, EtiquetaPipe } from './estado';

// Enums que no se muestran crudos: tienen su propio texto en la pantalla que los usa.
const SIN_ETIQUETA = ['Periodo', 'ReporteId', 'OpcionIntervencion'];

const enums = [...esquema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)].map(([, nombre, cuerpo]) => ({
  nombre,
  valores: cuerpo.split(/\s+/).filter(Boolean),
}));

// Campos String del esquema GraphQL con valores cerrados en OpenAPI (A-3): esquema con nombre → grupo de ETIQUETAS.
const GRUPO_DE_OPENAPI: Record<string, string> = {
  TipoHito: 'TipoHito',
  TipoRemolque: 'TipoRemolque',
  EstadoMantenimiento: 'EstadoMantenimiento',
  RazonObservacion: 'RazonObservacion',
  EstadoSolicitud: 'EstadoAprobacion',
  CanalServicio: 'CanalCotizacion',
};
const enumsOpenapi = [...[comun, finanzas, flota, viajes].join('\n').matchAll(/^ {4}(\w+):\n {6}type: string\n {6}enum: \[([^\]]*)\]/gm)]
  .filter(([, nombre]) => nombre in GRUPO_DE_OPENAPI)
  .map(([, nombre, cuerpo]) => ({ nombre, grupo: GRUPO_DE_OPENAPI[nombre], valores: cuerpo.split(',').map((v) => v.trim()) }));

// Enums en línea de OpenAPI (sin esquema con nombre): `Esquema.propiedad` → grupo de ETIQUETAS.
const GRUPO_EN_LINEA: Record<string, string> = {
  'Alerta.severidad': 'SeveridadAlerta',
  'Mision.estado': 'EstadoMision',
  'Mision.origen': 'OrigenMision',
  'Documento.tipo': 'TipoDocumento',
};
/** Cada esquema de `components.schemas` (4 espacios) con sus propiedades string de valores cerrados (8 espacios). */
const enumsEnLinea = [analitica, flota].flatMap((yaml) =>
  yaml.split(/^ {4}(?=\w+:\n)/m).flatMap((bloque) => {
    const esquema = bloque.match(/^(\w+):/)?.[1];
    return [...bloque.matchAll(/^ {8}(\w+):\n {10}type: string\n {10}enum: \[([^\]]*)\]/gm)]
      .map(([, prop, cuerpo]) => ({ campo: `${esquema}.${prop}`, valores: cuerpo.split(',').map((v) => v.trim()) }))
      .filter((x) => x.campo in GRUPO_EN_LINEA)
      .map((x) => ({ ...x, grupo: GRUPO_EN_LINEA[x.campo] }));
  }),
);

describe('etiquetas de los enums', () => {
  it('lee los enums en línea de OpenAPI (severidad, misión, documento)', () => {
    expect(enumsEnLinea.map((x) => x.campo).sort()).toEqual(Object.keys(GRUPO_EN_LINEA).sort());
  });

  it.each(enumsEnLinea)('$campo (OpenAPI, en línea) → $grupo: todo valor tiene etiqueta', ({ grupo, valores }) => {
    const g = (ETIQUETAS as Record<string, Record<string, unknown>>)[grupo];
    for (const v of valores) expect(g[v], `${grupo}.${v}`).toBeDefined();
  });

  it('lee los enums con nombre de OpenAPI', () => {
    expect(enumsOpenapi.map((x) => x.nombre).sort()).toEqual(Object.keys(GRUPO_DE_OPENAPI).sort());
  });

  it.each(enumsOpenapi)('$nombre (OpenAPI) → $grupo: todo valor tiene etiqueta', ({ grupo, valores }) => {
    const g = (ETIQUETAS as Record<string, Record<string, unknown>>)[grupo];
    for (const v of valores) expect(g[v], `${grupo}.${v}`).toBeDefined();
  });

  it('los estados del viaje que piden decisión nunca son neutros (A-12)', () => {
    for (const v of ['ENTREGA_OBSERVADA', 'ENTREGA_RECHAZADA', 'REQUIERE_INTERVENCION'])
      expect(etiqueta('EstadoViaje', v).tono).not.toBe('neutro');
  });

  it('lee los enums del esquema GraphQL', () => {
    expect(enums.map((x) => x.nombre)).toContain('EstadoViaje');
  });

  it.each(enums.filter((x) => !SIN_ETIQUETA.includes(x.nombre)))('$nombre: todo valor tiene etiqueta', ({ nombre, valores }) => {
    const grupo = (ETIQUETAS as Record<string, Record<string, unknown>>)[nombre];
    expect(grupo, `falta el grupo ${nombre} en ETIQUETAS`).toBeDefined();
    for (const v of valores) expect(grupo[v], `${nombre}.${v}`).toBeDefined();
  });

  it('un valor desconocido sale legible y neutro, nunca crudo', () => {
    expect(etiqueta('EstadoViaje', 'NUEVO_ESTADO')).toEqual({ texto: 'Nuevo estado', icono: 'help', tono: 'neutro' });
    expect(etiqueta('EstadoViaje', null).texto).toBe('Sin dato');
  });

  it('cc-estado muestra texto e icono decorativo con el tono del valor', () => {
    const f = TestBed.createComponent(Estado);
    f.componentRef.setInput('grupo', 'EstadoUnidad');
    f.componentRef.setInput('valor', 'MANTENIMIENTO_PENDIENTE');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('Mantenimiento pendiente');
    expect(el.dataset['tono']).toBe('aviso');
    expect(el.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('el pipe etiqueta da solo el texto', () => {
    expect(new EtiquetaPipe().transform('INSUMOS_LIQUIDOS', 'TipoCarga')).toBe('Insumos líquidos');
  });
});
