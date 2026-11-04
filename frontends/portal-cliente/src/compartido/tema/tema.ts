import { createTheme, type Theme } from '@mui/material/styles';
import { opcionesTemaMui } from '@transporte/design-tokens/mui';

/**
 * Tema MUI desde los tokens (D47): claro y oscuro con variables CSS y el atributo data-tema en <html>. Las tablas siguen
 * a `.tabla-ancha` del Centro de Control (DESIGN.md, «Componentes»): encabezado con fondo y cifras de ancho fijo.
 */
export const tema = createTheme(opcionesTemaMui, {
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
        // Fondo opaco con el tinte encima: la primera columna fija no deja ver lo que pasa por debajo.
        head: ({ theme }: { theme: Theme }) => ({
          backgroundColor: theme.vars?.palette.background.paper,
          backgroundImage: `linear-gradient(${theme.vars?.palette.action.hover}, ${theme.vars?.palette.action.hover})`,
          fontWeight: 600,
        }),
      },
    },
  },
});
