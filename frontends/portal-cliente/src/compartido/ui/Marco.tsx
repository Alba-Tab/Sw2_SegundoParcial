import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { asegurarDueno, limpiarCache } from '../offline/cache';
import { useEnLinea } from '../offline/useEnLinea';
import { useClienteActivo } from '../sesion/ClienteActivo';
import { useSesion } from '../sesion/useSesion';
import { AvisoComercial } from './AvisoComercial';
import { Bienvenida } from './Bienvenida';
import { BotonEnlace } from './BotonEnlace';

type Ruta = '/cotizar' | '/servicios' | '/facturas' | '/empresa' | '/clientes';
const MENU_CLIENTE: { a: Ruta; texto: string }[] = [
  { a: '/cotizar', texto: 'Cotizar' },
  { a: '/servicios', texto: 'Mis servicios' },
  { a: '/facturas', texto: 'Facturas' },
  { a: '/empresa', texto: 'Mi empresa' },
];
const MENU_COMERCIAL: { a: Ruta; texto: string }[] = [
  { a: '/clientes', texto: 'Clientes' },
  { a: '/cotizar', texto: 'Cotizar' },
  { a: '/servicios', texto: 'Servicios' },
  { a: '/facturas', texto: 'Facturas' },
];
/** Lo que se puede leer sin conexión desde la caché (propuesta 6.4). */
const SIN_CONEXION = ['/servicios', '/facturas'];

/**
 * Barra y contenido. Sin sesión, la bienvenida (o la caché de lectura si no hay conexión); sin empresa vinculada, solo
 * "Mi empresa" (spec 001); en modo comercial, primero se elige el cliente.
 */
export function Marco() {
  const s = useSesion();
  const activo = useClienteActivo();
  const consultas = useQueryClient();
  const enLinea = useEnLinea();
  const ruta = useRouterState({ select: (e) => e.location.pathname });

  useEffect(() => {
    if (s.sub) asegurarDueno(consultas, s.sub);
  }, [consultas, s.sub]);

  const soloCache = !s.autenticado && !enLinea && SIN_CONEXION.some((r) => ruta.startsWith(r));
  let contenido = <Outlet />;
  if (soloCache) contenido = <Outlet />;
  else if (s.cargando) contenido = <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} aria-label="Cargando" />;
  else if (!s.autenticado) contenido = <Bienvenida sinConexion={!enLinea} />;
  else if (s.necesitaEmpresa && ruta !== '/empresa') contenido = <Navigate to="/empresa" />;
  else if (activo.modoComercial && !activo.clienteId && ruta !== '/clientes') contenido = <Navigate to="/clientes" />;

  const menu = !s.autenticado || s.necesitaEmpresa ? [] : activo.modoComercial ? MENU_COMERCIAL : MENU_CLIENTE;
  return (
    <>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="h1" sx={{ mr: 2 }}>
            Transporte de carga
          </Typography>
          {menu.map((m) => (
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
              <Button
                color="inherit"
                onClick={() => {
                  limpiarCache(consultas);
                  void s.cerrar();
                }}
              >
                Salir
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      {s.autenticado && <AvisoComercial />}
      {soloCache && (
        <Alert severity="info" square>
          Sin conexión: ves lo último que guardaste en este equipo. Para cotizar o confirmar, vuelve a conectarte.
        </Alert>
      )}
      <Container sx={{ py: 4 }}>{contenido}</Container>
    </>
  );
}
