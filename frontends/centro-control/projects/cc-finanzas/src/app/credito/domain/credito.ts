import type { SolicitudesQuery } from '../../graphql/generado';

/** Spec 012 (paso 2b de la saga): solicitud de aprobación de crédito de un cliente en mora. */
export type Solicitud = NonNullable<SolicitudesQuery['solicitudesAprobacion']>[number];

/** Rechazar exige un motivo de 3 caracteres o más; aprobar no. */
export const puedeRechazar = (motivo: string | undefined): boolean => (motivo ?? '').trim().length >= 3;
