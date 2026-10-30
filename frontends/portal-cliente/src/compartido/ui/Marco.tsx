import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useSesion } from '../sesion/useSesion';
import { Bienvenida } from './Bienvenida';
import { BotonEnlace } from './BotonEnlace';

const MENU = [
  { a: '/cotizar', texto: 'Cotizar' },
  { a: '/empresa', texto: 'Mi empresa' },
] as const;

/** Barra y contenido. Sin sesión, la bienvenida; sin empresa vinculada, solo "Mi empresa" (spec 001). */
export function Marco() {
  const s = useSesion();
  const ruta = useRouterState({ select: (e) => e.location.pathname });

  let contenido = <Outlet />;
  if (s.cargando) contenido = <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} aria-label="Cargando" />;
  else if (!s.autenticado) contenido = <Bienvenida />;
  else if (s.necesitaEmpresa && ruta !== '/empresa') contenido = <Navigate to="/empresa" />;

  return (
    <>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" component="h1" sx={{ mr: 2 }}>
            Transporte de carga
          </Typography>
          {s.autenticado &&
            !s.necesitaEmpresa &&
            MENU.map((m) => (
              <BotonEnlace
                key={m.a}
                color="inherit"
                to={m.a}
                activeProps={{ 'aria-current': 'page', style: { textDecoration: 'underline' } }}
              >
                {m.texto}
              </BotonEnlace>
            ))}
          <Box sx={{ flexGrow: 1 }} />
          {s.autenticado && (
            <>
              <Typography variant="body2">{s.nombre}</Typography>
              <Button color="inherit" onClick={() => void s.cerrar()}>
                Salir
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 4 }}>{contenido}</Container>
    </>
  );
}
