import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { tema } from './compartido/tema/tema';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ThemeProvider theme={tema}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
