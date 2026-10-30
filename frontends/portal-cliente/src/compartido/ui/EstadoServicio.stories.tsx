import Stack from '@mui/material/Stack';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EstadoServicio, type EstadoViaje } from './EstadoServicio';

const meta: Meta<typeof EstadoServicio> = { title: 'Compartido/EstadoServicio', component: EstadoServicio };
export default meta;

export const EnRuta: StoryObj<typeof EstadoServicio> = { args: { estado: 'EN_RUTA' } };
export const EnAprobacion: StoryObj<typeof EstadoServicio> = { args: { estado: 'PROGRAMANDO', etapa: 'ESPERANDO_APROBACION' } };

const TODOS: EstadoViaje[] = [
  'PROGRAMANDO',
  'CONFIRMADO',
  'EN_RUTA',
  'ENTREGADO',
  'CERRADO',
  'CANCELADO',
  'ENTREGA_OBSERVADA',
  'ENTREGA_RECHAZADA',
  'REQUIERE_INTERVENCION',
];
export const Todos: StoryObj<typeof EstadoServicio> = {
  render: () => (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {TODOS.map((e) => (
        <EstadoServicio key={e} estado={e} />
      ))}
    </Stack>
  ),
};
