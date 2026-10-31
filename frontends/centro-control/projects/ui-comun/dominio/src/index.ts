/**
 * ui-comun/dominio: lo puro de ui-comun (dinero en centavos, fechas de La Paz, roles por campo). Sin Angular, Apollo ni
 * rxjs, para que lo use la capa `domain/` de cada feature; `npm run capas` impide que `domain/` importe el índice de
 * `ui-comun`, que sí carga Angular.
 */
export * from './dinero';
export * from './formato';
export * from './permisos';
