import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

const texto = (nombre: string, descripcion: string, valido: (v: string) => boolean) =>
  new GraphQLScalarType({
    name: nombre,
    description: descripcion,
    serialize: (v) => (v === null || v === undefined ? v : String(v)),
    parseValue: (v) => {
      if (typeof v !== 'string' || !valido(v)) throw new TypeError(`${nombre} inválido: ${String(v)}`);
      return v;
    },
    parseLiteral: (ast) => {
      if (ast.kind !== Kind.STRING || !valido(ast.value)) throw new TypeError(`${nombre} inválido`);
      return ast.value;
    },
  });

export const Fecha = texto('Fecha', 'YYYY-MM-DD', (v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
export const Instante = texto('Instante', 'ISO-8601 en UTC', (v) => !Number.isNaN(Date.parse(v)));
// 000 §3: el dinero nunca viaja como float.
export const Dinero = texto('Dinero', 'Monto con 2 decimales', (v) => /^(0|[1-9]\d{0,11})\.\d{2}$/.test(v));
export const Cursor = texto('Cursor', 'Cursor opaco', (v) => v.length <= 500);

function literal(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.OBJECT:
      return Object.fromEntries(ast.fields.map((f) => [f.name.value, literal(f.value)]));
    case Kind.LIST:
      return ast.values.map(literal);
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.STRING:
    case Kind.ENUM:
      return ast.value;
    case Kind.BOOLEAN:
      return ast.value;
    default:
      return null;
  }
}

export const JSONEscalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: literal,
});
