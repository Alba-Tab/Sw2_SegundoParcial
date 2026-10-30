import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useMemo } from 'react';
import { getListarServiciosQueryKey, listarServicios, type Servicio, useListarRutas } from '../../api/generado/viajes';
import { dinero, fecha, TIPOS_CARGA } from '../../compartido/formato/formato';
import { BotonEnlace } from '../../compartido/ui/BotonEnlace';
import { EstadoServicio } from '../../compartido/ui/EstadoServicio';
import { Problema } from '../../compartido/ui/Problema';

const col = createColumnHelper<Servicio>();

/** Los servicios del cliente del token, del más reciente al más antiguo, por páginas (cursor). */
export function PaginaServicios() {
  const navegar = useNavigate();
  const rutas = useListarRutas();
  const paginas = useInfiniteQuery({
    queryKey: getListarServiciosQueryKey(),
    queryFn: ({ pageParam, signal }) => listarServicios(pageParam ? { cursor: pageParam } : undefined, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.siguienteCursor ?? undefined,
  });
  const nombreRuta = useMemo(() => new Map((rutas.data ?? []).map((r) => [r.rutaId, r.nombre])), [rutas.data]);
  const columnas = useMemo(
    () => [
      col.accessor('creadoEn', { header: 'Pedido', cell: (c) => fecha(c.getValue().slice(0, 10)) }),
      col.accessor('rutaId', { header: 'Ruta', cell: (c) => nombreRuta.get(c.getValue() ?? '') ?? '—' }),
      col.accessor('tipoCarga', { header: 'Carga', cell: (c) => (c.getValue() ? TIPOS_CARGA[c.getValue()!] : '—') }),
      col.accessor('toneladas', { header: 'Toneladas', cell: (c) => c.getValue() ?? '—' }),
      col.accessor('monto', { header: 'Monto', cell: (c) => (c.getValue() ? dinero(c.getValue()!) : '—') }),
      col.accessor('estado', { header: 'Estado', cell: (c) => <EstadoServicio estado={c.getValue()} etapa={c.row.original.etapa} /> }),
    ],
    [nombreRuta],
  );
  const datos = useMemo(() => paginas.data?.pages.flatMap((p) => p.items) ?? [], [paginas.data]);
  // React Compiler deja sin memoizar este componente (TanStack Table no es compatible); es lo esperado.
  // eslint-disable-next-line react-hooks/incompatible-library
  const tabla = useReactTable({ data: datos, columns: columnas, getCoreRowModel: getCoreRowModel() });

  if (paginas.isPending) return <CircularProgress aria-label="Cargando" />;
  if (paginas.isError) return <Problema error={paginas.error} />;
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h2">
        Mis servicios
      </Typography>
      {datos.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography gutterBottom>Todavía no pediste servicios.</Typography>
          <BotonEnlace to="/cotizar" variant="contained">
            Cotizar
          </BotonEnlace>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              {tabla.getHeaderGroups().map((g) => (
                <TableRow key={g.id}>
                  {g.headers.map((h) => (
                    <TableCell key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHead>
            <TableBody>
              {tabla.getRowModel().rows.map((f) => (
                <TableRow
                  key={f.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => void navegar({ to: '/servicios/$servicioId', params: { servicioId: f.original.servicioId } })}
                >
                  {f.getVisibleCells().map((c) => (
                    <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      {paginas.hasNextPage && (
        <Button onClick={() => void paginas.fetchNextPage()} loading={paginas.isFetchingNextPage} sx={{ alignSelf: 'flex-start' }}>
          Ver más
        </Button>
      )}
    </Stack>
  );
}
