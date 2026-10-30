import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect } from 'react';
import { tema } from '../src/compartido/tema/tema';

function Esquema({ modo, children }: { modo: 'light' | 'dark'; children: React.ReactNode }) {
  const { setMode } = useColorScheme();
  useEffect(() => setMode(modo), [modo, setMode]);
  return children;
}

/** Cada historia con el tema del portal; la barra de Storybook cambia entre claro y oscuro. */
const conTema: Decorator = (Historia, contexto) => (
  <ThemeProvider theme={tema}>
    <CssBaseline />
    <Esquema modo={contexto.globals.tema === 'oscuro' ? 'dark' : 'light'}>
      <Historia />
    </Esquema>
  </ThemeProvider>
);

const preview: Preview = {
  decorators: [conTema],
  globalTypes: {
    tema: {
      description: 'Esquema de color',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'claro', title: 'Claro' },
          { value: 'oscuro', title: 'Oscuro' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { tema: 'claro' },
};
export default preview;
