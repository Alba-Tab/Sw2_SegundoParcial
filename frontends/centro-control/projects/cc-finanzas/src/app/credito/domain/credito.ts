import type { SolicitudesQuery } from '../../graphql/generado';

/** Spec 012 (paso 2b de la saga): solicitud de aprobación de crédito de un cliente en mora. */
export type Solicitud = NonNullable<SolicitudesQuery['solicitudesAprobacion']>[number];
