import Assignment from '@mui/icons-material/Assignment';
import Business from '@mui/icons-material/Business';
import Groups from '@mui/icons-material/Groups';
import Logout from '@mui/icons-material/Logout';
import ReceiptLong from '@mui/icons-material/ReceiptLong';
import RequestQuote from '@mui/icons-material/RequestQuote';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { limpiarCache } from '../offline/cache';
import { useCacheDelUsuario } from '../offline/useCacheDelUsuario';
import { useEnLinea } from '../offline/useEnLinea';
import { useClienteActivo } from '../sesion/ClienteActivo';
import { useSesion } from '../sesion/useSesion';
import { AvisoComercial } from './AvisoComercial';
import { Bienvenida } from './Bienvenida';
import { BotonEnlace } from './BotonEnlace';
import { tituloDe } from './titulo';

type Ruta = '/cotizar' | '/servicios' | '/facturas' | '/empresa' | '/clientes';
// Un icono, un significado (DESIGN.md, "Iconografía"); el icono acompaña al texto y MUI lo marca aria-hidden.
const MENU_CLIENTE: { a: Ruta; texto: string; icono: ReactNode }[] = [
  { a: '/cotizar', texto: 'Cotizar', icono: <RequestQuote /> },
  { a: '/servicios', texto: 'Mis servicios', icono: <Assignment /> },
  { a: '/facturas', texto: 'Facturas', icono: <ReceiptLong /> },
  { a: '/empresa', texto: 'Mi empresa', icono: <Business /> },
];
const MENU_COMERCIAL: { a: Ruta; texto: string; icono: ReactNode }[] = [
  { a: '/clientes', texto: 'Clientes', icono: <Groups /> },
  { a: '/cotizar', texto: 'Cotizar', icono: <RequestQuote /> },
  { a: '/servicios', texto: 'Servicios', icono: <Assignment /> },
  { a: '/facturas', texto: 'Facturas', icono: <ReceiptLong /> },
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

  const cacheLista = useCacheDelUsuario(consultas, s.sub);
  useEffect(() => {
    document.title = tituloDe(ruta);
  }, [ruta]);

  const soloCache = !s.autenticado && !enLinea && SIN_CONEXION.some((r) => ruta.startsWith(r));
  let contenido = <Outlet />;
  if (soloCache) contenido = <Outlet />;
  else if (s.cargando || !cacheLista) contenido = <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} aria-label="Cargando" />;
  else if (!s.autenticado) contenido = <Bienvenida sinConexion={!enLinea} />;
  else if (s.necesitaEmpresa && ruta !== '/empresa') contenido = <Navigate to="/empresa" />;
  else if (activo.modoComercial && !activo.clienteId && ruta !== '/clientes') contenido = <Navigate to="/clientes" />;

  const menu = !s.autenticado || s.necesitaEmpresa ? [] : activo.modoComercial ? MENU_COMERCIAL : MENU_CLIENTE;
  return (
    <>
      {/* Desde md, la barra y la banda del modo comercial quedan fijas juntas (N7). En un celular la barra se va con el
          scroll (B-4) y solo la banda, en una línea, queda fija: con `display: contents` la caja no la encierra (V1-14). */}
      <Box sx={{ display: { xs: 'contents', md: 'block' }, position: { md: 'sticky' }, top: 0, zIndex: (t) => t.zIndex.appBar }}>
        <AppBar position="static" elevation={0}>
          <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h1" sx={{ mr: 2 }}>
              Transporte de carga
            </Typography>
            {menu.map((m) => (
              <BotonEnlace
                key={m.a}
                color="inherit"
                to={m.a}
                startIcon={m.icono}
                activeProps={{ 'aria-current': 'page' }}
                // La página actual se marca con fondo y peso (I6), no con subrayado.
                sx={{
                  minHeight: 44,
                  '&[aria-current="page"]': { bgcolor: (t) => alpha(t.palette.common.white, 0.18), fontWeight: 700 },
                }}
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
                  startIcon={<Logout />}
                  sx={{ minHeight: 44 }}
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
        {s.autenticado && cacheLista && (
          <Box sx={{ position: { xs: 'sticky', md: 'static' }, top: 0, zIndex: (t) => t.zIndex.appBar }}>
            <AvisoComercial />
          </Box>
        )}
      </Box>
      {soloCache && (
        <Alert severity="info" square>
          Sin conexión: ves lo último que guardaste en este equipo. Para cotizar o confirmar, vuelve a conectarte.
        </Alert>
      )}
      <Container sx={{ py: 4 }}>{contenido}</Container>
    </>
  );
}
