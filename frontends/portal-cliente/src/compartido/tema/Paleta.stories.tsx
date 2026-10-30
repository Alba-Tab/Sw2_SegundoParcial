import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { rolesM3 } from '@transporte/design-tokens/mui';

/** Los roles de Material 3 que salen de libs/design-tokens (D47) y cómo se ven en los componentes de MUI. */
const meta: Meta = { title: 'Tema/Paleta' };
export default meta;

const ROLES = ['primary', 'secondary', 'tertiary', 'error', 'exito', 'advertencia'];

function Muestra({ esquema }: { esquema: 'claro' | 'oscuro' }) {
  const r = rolesM3[esquema];
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ p: 2, bgcolor: r.surface, borderRadius: 2 }}>
      {ROLES.map((rol) => {
        const on = `on${rol[0].toUpperCase()}${rol.slice(1)}`;
        return (
          <Box key={rol} sx={{ width: 140, p: 1.5, borderRadius: 1.5, bgcolor: r[rol], color: r[on] }}>
            <Typography variant="caption" component="div">
              {rol}
            </Typography>
            <Typography variant="caption">{r[rol]}</Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

export const Roles: StoryObj = {
  render: () => (
    <Stack spacing={2}>
      <Muestra esquema="claro" />
      <Muestra esquema="oscuro" />
    </Stack>
  ),
};

export const Componentes: StoryObj = {
  render: () => (
    <Stack spacing={2} sx={{ maxWidth: 420 }}>
      <TextField label="Razón social" defaultValue="Agroexport S.R.L." />
      <Stack direction="row" spacing={1}>
        <Button variant="contained">Confirmar servicio</Button>
        <Button variant="outlined">Cancelar</Button>
        <Button color="error">Rechazar</Button>
      </Stack>
    </Stack>
  ),
};
