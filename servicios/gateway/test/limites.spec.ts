import { buildSchema, parse, validate } from 'graphql';
import { configuracion } from '../src/configuracion';
import { limiteContado, limiteProfundidad } from '../src/graphql/limites';
import { sumar } from '../src/graphql/mapeos';

describe('límites (D101)', () => {
  const esquema = buildSchema('type Nodo { hijo: Nodo, nombre: String } type Query { raiz: Nodo }');
  const consulta = (n: number) => `{ raiz ${'{ hijo '.repeat(n - 1)}{ nombre }${' }'.repeat(n - 1)} }`;

  it('profundidad 8 pasa y 12 no, también escondida en fragmentos', () => {
    expect(validate(esquema, parse(consulta(7)), [limiteProfundidad()])).toHaveLength(0);
    const errores = validate(esquema, parse(consulta(12)), [limiteProfundidad()]);
    expect(errores[0].extensions['codigo']).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    const fragmentos = parse(
      '{ raiz { ...a } } fragment a on Nodo { hijo { hijo { hijo { hijo { hijo { hijo { hijo { hijo { nombre } } } } } } } } }',
    );
    expect(validate(esquema, fragmentos, [limiteProfundidad()])).toHaveLength(1);
  });

  it('__schema y __type cuentan; solo __typename no suma', () => {
    const tipo = (n: number) => `${'ofType { '.repeat(n)}name${' }'.repeat(n)}`;
    const introspeccion = parse(`{ __schema { types { fields { type { ${tipo(8)} } } } } }`);
    expect(validate(esquema, introspeccion, [limiteProfundidad()])[0].extensions['codigo']).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    expect(validate(esquema, parse(`{ __type(name: "Nodo") { fields { type { ${tipo(6)} } } } }`), [limiteProfundidad()])).toHaveLength(1);
    expect(validate(esquema, parse('{ __type(name: "Nodo") { name } }'), [limiteProfundidad()])).toHaveLength(0);
    const conTypename = `{ raiz ${'{ __typename hijo '.repeat(6)}{ nombre }${' }'.repeat(6)} }`;
    expect(validate(esquema, parse(conTypename), [limiteProfundidad()])).toHaveLength(0);
  });

  it('el limite que se cuenta nunca baja de 1 ni pasa de 100; null o ausente → el valor por defecto del campo', () => {
    const campo = { args: [{ name: 'limite', defaultValue: 50 }] } as never;
    expect([-100, 0, 1, 37, 100, 5000].map((v) => limiteContado(campo, v))).toEqual([1, 1, 1, 37, 100, 100]);
    expect([null, undefined, Number.NaN, 'x'].map((v) => limiteContado(campo, v))).toEqual([50, 50, 50, 50]);
    expect(limiteContado({ args: [{ name: 'limite' }] } as never, null)).toBe(20);
  });
});

describe('configuración', () => {
  it('introspección apagada salvo GRAPHQL_INTROSPECCION=true', () => {
    expect(configuracion({}).introspeccion).toBe(false);
    expect(configuracion({ GRAPHQL_INTROSPECCION: 'false' }).introspeccion).toBe(false);
    expect(configuracion({ GRAPHQL_INTROSPECCION: 'true' }).introspeccion).toBe(true);
  });
});

describe('dinero', () => {
  it('suma en centavos, sin float', () => {
    expect(sumar(['7600.00', '2800.00', null, '0.10', '0.20'])).toBe('10400.30');
    expect(sumar([])).toBe('0.00');
  });
});
