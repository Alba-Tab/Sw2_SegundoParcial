import { createTheme } from '@mui/material/styles';
import { opcionesTemaMui } from '@transporte/design-tokens/mui';

/** Tema MUI desde los tokens (D47): claro y oscuro con variables CSS y el atributo data-tema en <html>. */
export const tema = createTheme(opcionesTemaMui);
