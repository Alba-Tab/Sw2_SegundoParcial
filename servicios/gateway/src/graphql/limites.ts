import type { ApolloServerPlugin } from '@apollo/server';
import {
  type ASTVisitor,
  GraphQLError,
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
const LISTA_POR_DEFECTO = 20;

const demasiado = (mensaje: string) =>
  new GraphQLError(mensaje, { extensions: { codigo: 'CONSULTA_DEMASIADO_COMPLEJA', status: 400, http: { status: 400 } } });

/** Regla de validación: corta antes de llamar a ningún servicio. */
export function limiteProfundidad(maximo = PROFUNDIDAD_MAXIMA) {
  return (contexto: ValidationContext): ASTVisitor => {
    const fragmentos = new Map<string, FragmentDefinitionNode>();
    for (const d of contexto.getDocument().definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) fragmentos.set(d.name.value, d);
    const profundidad = (sel: SelectionSetNode | undefined, nivel: number, vistos: Set<string>): number => {
      if (!sel) return nivel;
      let max = nivel;
      for (const s of sel.selections) {
        if (s.kind === Kind.FIELD) {
          if (s.name.value.startsWith('__')) continue;
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

/** Cada campo vale 1 y una lista con argumento `limite` multiplica por él (máximo 100; D101). */
const porLimite: ComplexityEstimator = ({ field, args, childComplexity }) => {
  if (!String(field.type).includes('[') || !field.args.some((a) => a.name === 'limite')) return undefined;
  const limite = Math.min(100, Number(args['limite'] ?? LISTA_POR_DEFECTO));
  return 1 + limite * Math.max(1, childComplexity);
};

export function limiteComplejidad(esquema: () => GraphQLSchema, maximo = COMPLEJIDAD_MAXIMA): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({ request, document }) {
          const complejidad = getComplexity({
            schema: esquema(),
            query: document,
            variables: request.variables ?? {},
            operationName: request.operationName,
            estimators: [porLimite, simpleEstimator({ defaultComplexity: 1 })],
          });
          if (complejidad > maximo) throw demasiado(`La consulta tiene complejidad ${complejidad}; el máximo es ${maximo}`);
        },
      };
    },
  };
}
