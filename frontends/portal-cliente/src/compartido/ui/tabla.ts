import type { SxProps, Theme } from '@mui/material/styles';

/** En el teléfono la tabla se desliza de lado con la primera columna fija, como en el Centro de Control. */
export const TABLA_SX: SxProps<Theme> = {
  '& tr > :first-of-type': { position: { xs: 'sticky', md: 'static' }, left: 0, zIndex: 1 },
  '& tbody tr > :first-of-type': { bgcolor: { xs: 'background.paper', md: 'transparent' } },
};

const NUMERICAS = new Set(['toneladas', 'monto', 'saldo']);

/** Cantidades y montos a la derecha (DESIGN.md, «Números»), en el encabezado y en la celda. */
export const alinear = (columna: string) => (NUMERICAS.has(columna) ? 'right' : undefined);
