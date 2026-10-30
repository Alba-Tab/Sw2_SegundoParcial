import type { ApolloServerPlugin } from '@apollo/server';
import {
  type ASTVisitor,
  GraphQLError,
  type GraphQLField,
  type GraphQLSchema,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
  type FragmentDefinitionNode,
} from 'graphql';
import { getComplexity, simpleEstimator, type ComplexityEstimator } from 'graphql-query-complexity';

/** D101: profundidad máxima 8 y complejidad máxima 1.000. */
export const PROFUNDIDAD_MAXIMA = 8;
export const COMPLEJIDAD_MAXIMA = 1000;
/** 000 §4: `limite` por defecto 20 y máximo 100. */
export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 100;

const demasiado = (mensaje: string) =>
  new GraphQLError(mensaje, { extensions: { codigo: 'CONSULTA_DEMASIADO_COMPLEJA', status: 400, http: { status: 400 } } });

/**
 * Regla de validación: corta antes de llamar a ningún servicio. Cuenta también `__schema` y `__type` (una consulta de
 * introspección profunda pasa el límite como cualquier otra); solo `__typename` no suma.
 */
export function limiteProfundidad(maximo = PROFUNDIDAD_MAXIMA) {
  return (contexto: ValidationContext): ASTVisitor => {
    const fragmentos = new Map<string, FragmentDefinitionNode>();
    for (const d of contexto.getDocument().definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) fragmentos.set(d.name.value, d);
    const profundidad = (sel: SelectionSetNode | undefined, nivel: number, vistos: Set<string>): number => {
      if (!sel) return nivel;
      let max = nivel;
      for (const s of sel.selections) {
        if (s.kind === Kind.FIELD) {
          if (s.name.value === '__typename') continue;
          max = Math.max(max, profundidad(s.selectionSet, nivel + 1, vistos));
        } else if (s.kind === Kind.INLINE_FRAGMENT) {
          max = Math.max(max, profundidad(s.selectionSet, nivel, vistos));
        } else if (!vistos.has(s.name.value)) {
          max = Math.max(max, profundidad(fragmentos.get(s.name.value)?.selectionSet, nivel, new Set([...vistos, s.name.value])));
        }
      }
      return max;
    };
    return {
      OperationDefinition(nodo) {
        const p = profundidad(nodo.selectionSet, 0, new Set());
        if (p > maximo) contexto.reportError(demasiado(`La consulta tiene profundidad ${p}; el máximo es ${maximo}`));
      },
    };
  };
}

/**
 * El `limite` con que se cuenta una lista: el del argumento acotado a 1–100; sin valor (o `null`), el valor por defecto
 * del campo en el esquema, o 20. Un `limite` fuera de 1–100 lo rechazan después los resolvers con `VALIDACION`; aquí
 * nunca puede bajar la cuenta.
 */
export function limiteContado(campo: Pick<GraphQLField<unknown, unknown>, 'args'>, valor: unknown): number {
  const porDefecto = campo.args.find((a) => a.name === 'limite')?.defaultValue;
  const n = typeof valor === 'number' && Number.isFinite(valor) ? valor : Number(porDefecto ?? LIMITE_POR_DEFECTO);
  return Math.max(1, Math.min(LIMITE_MAXIMO, Math.trunc(Number.isFinite(n) ? n : LIMITE_POR_DEFECTO)));
}

/** Cada campo vale 1 y una lista con argumento `limite` multiplica por él, acotado a 1–100 (D101). */
const porLimite: ComplexityEstimator = ({ field, args, childComplexity }) => {
  if (!String(field.type).includes('[') || !field.args.some((a) => a.name === 'limite')) return undefined;
  return 1 + limiteContado(field, args['limite']) * Math.max(1, childComplexity);
};

export function complejidad(
  esquema: GraphQLSchema,
  consulta: Parameters<typeof getComplexity>[0]['query'],
  variables = {},
  operacion?: string,
) {
  return getComplexity({
    schema: esquema,
    query: consulta,
    variables,
    operationName: operacion,
    estimators: [porLimite, simpleEstimator({ defaultComplexity: 1 })],
  });
}

export function limiteComplejidad(esquema: () => GraphQLSchema, maximo = COMPLEJIDAD_MAXIMA): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({ request, document }) {
          let total: number;
          try {
            total = complejidad(esquema(), document, request.variables ?? {}, request.operationName ?? undefined);
          } catch {
            // Variables que faltan o con otro tipo: no se puede contar, y la ejecución las rechaza igual con
            // BAD_USER_INPUT (400 VALIDACION) antes de llamar a ningún servicio.
            return;
          }
          if (total > maximo) throw demasiado(`La consulta tiene complejidad ${total}; el máximo es ${maximo}`);
        },
      };
    },
  };
}
