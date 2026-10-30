import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import { defaultFieldResolver, type GraphQLSchema } from 'graphql';
import type { Contexto } from '../autenticacion';
import { sinPermiso } from '../errores';

/**
 * Directiva `@roles(permitidos: [...])` (spec 016, permisos por campo): si el rol del token no está, el campo sale en
 * null con un error SIN_PERMISO en su `path` y el resto de la respuesta sigue. Es la tercera de las cuatro capas: el
 * servicio dueño vuelve a validar y filtra las filas (propuesta 7.5).
 */
export function aplicarRoles(esquema: GraphQLSchema): GraphQLSchema {
  return mapSchema(esquema, {
    [MapperKind.OBJECT_FIELD]: (campo) => {
      const directiva = getDirective(esquema, campo, 'roles')?.[0] as { permitidos: string[] } | undefined;
      if (!directiva) return campo;
      const resolver = campo.resolve ?? defaultFieldResolver;
      return {
        ...campo,
        resolve(fuente, args, ctx: Contexto, info) {
          if (!ctx.usuario.roles.some((r) => directiva.permitidos.includes(r))) throw sinPermiso();
          return resolver(fuente, args, ctx, info);
        },
      };
    },
  });
}
