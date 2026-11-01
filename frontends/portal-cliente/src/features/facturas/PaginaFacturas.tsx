import EventBusy from '@mui/icons-material/EventBusy';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Factura, getListarFacturasQueryKey, listarFacturas } from '../../api/generado/finanzas';
import { compararMontos, dinero, fecha } from '../../compartido/formato/formato';
import { Antiguedad } from '../../compartido/offline/Antiguedad';
import { useClienteActivo } from '../../compartido/sesion/ClienteActivo';
import { desdeEnlace, Enlace } from '../../compartido/ui/Enlace';
import { EstadoFactura } from '../../compartido/ui/EstadoServicio';
import { Problema } from '../../compartido/ui/Problema';
import { Credito } from './Credito';
import { Cargando } from '../../compartido/ui/Cargando';

const col = createColumnHelper<Factura>();

/** Páginas que se piden solas para encontrar la factura del enlace; después, el cliente sigue con «Ver más». */
const PAGINAS_PARA_BUSCAR = 5;

/** Specs 006 y 008: facturas con su saldo (TanStack Table con orden) y la línea de crédito. */
export function PaginaFacturas() {
  const activo = useClienteActivo();
  const navegar = useNavigate();
  // El correo de FacturaEmitida enlaza a /facturas/{facturaId}: esa fila se resalta y recibe el foco una vez (N6).
  const { facturaId: elegida } = useParams({ strict: false });
  const enfocada = useRef<string | undefined>(undefined);
  const [conSaldo, setConSaldo] = useState(false);
  const [orden, setOrden] = useState<SortingState>([{ id: 'venceEl', desc: false }]);
  const params = { ...(activo.modoComercial ? { clienteId: activo.clienteId } : {}), ...(conSaldo ? { conSaldo: true } : {}) };
  const paginas = useInfiniteQuery({
    queryKey: getListarFacturasQueryKey(params),
    queryFn: ({ pageParam, signal }) => listarFacturas({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.siguienteCursor ?? undefined,
    enabled: !activo.modoComercial || !!activo.clienteId,
  });
  const columnas = useMemo(
    () => [
      col.accessor('numero', { header: 'Número' }),
      col.accessor('emitidaEl', { header: 'Emitida', cell: (c) => fecha(c.getValue()) }),
      col.accessor('venceEl', {
        header: 'Vence',
        cell: (c) => (
          <>
            {fecha(c.getValue())}
            {c.row.original.vencida && (
              <Chip icon={<EventBusy />} label={`${c.row.original.diasVencida} días vencida`} color="error" size="small" sx={{ ml: 1 }} />
            )}
          </>
        ),
      }),
      col.accessor('monto', {
        header: 'Monto',
        cell: (c) => dinero(c.getValue()),
        sortingFn: (a, b) => compararMontos(a.original.monto, b.original.monto),
      }),
      col.accessor('saldo', {
        header: 'Saldo',
        cell: (c) => dinero(c.getValue()),
        sortingFn: (a, b) => compararMontos(a.original.saldo, b.original.saldo),
      }),
      col.accessor('estado', {
        header: 'Estado',
        cell: (c) => <EstadoFactura estado={c.getValue()} />,
      }),
      // La fila lleva al servicio: el enlace lo dice y sirve con teclado; su contexto es la fila de la factura (V3-1).
      col.display({
        id: 'servicio',
        header: 'Servicio',
        cell: (c) => (
          <Enlace to="/servicios/$servicioId" params={{ servicioId: c.row.original.servicioId }}>
            Ver servicio
          </Enlace>
        ),
      }),
    ],
    [],
  );
  const datos = useMemo(() => paginas.data?.pages.flatMap((p) => p.items) ?? [], [paginas.data]);
  // La factura del enlace puede estar en una página que aún no se cargó: se piden más, hasta un tope (B-3).
  const falta = !!elegida && !datos.some((f) => f.facturaId === elegida);
  const paginasLeidas = paginas.data?.pages.length ?? 0;
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = paginas;
  // Si la página siguiente falla, se para: sin esto el efecto la vuelve a pedir sin pausa (V1-2).
  useEffect(() => {
    if (falta && hasNextPage && !isFetchingNextPage && !isFetchNextPageError && paginasLeidas < PAGINAS_PARA_BUSCAR) void fetchNextPage();
  }, [falta, hasNextPage, isFetchingNextPage, isFetchNextPageError, paginasLeidas, fetchNextPage]);
  // React Compiler deja sin memoizar este componente (TanStack Table no es compatible); es lo esperado.
  // eslint-disable-next-line react-hooks/incompatible-library
  const tabla = useReactTable({
    data: datos,
    columns: columnas,
    state: { sorting: orden },
    onSortingChange: setOrden,
    sortDescFirst: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        Facturas y crédito
      </Typography>
      <Credito />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6" component="h2">
          Facturas
        </Typography>
        <FormControlLabel control={<Switch checked={conSaldo} onChange={(e) => setConSaldo(e.target.checked)} />} label="Solo con saldo" />
      </Stack>
      {paginas.data && <Antiguedad actualizadoEn={paginas.dataUpdatedAt} fallo={paginas.isError} />}
      {paginas.isPending && paginas.fetchStatus === 'fetching' && <Cargando />}
      {paginas.isError && !paginas.data && <Problema error={paginas.error} reintentar={paginas.refetch} />}
      {paginas.data && datos.length === 0 && <Typography color="text.secondary">No hay facturas.</Typography>}
      {falta && paginas.data && !paginas.hasNextPage && <Alert severity="info">No encontramos la factura del enlace en esta lista.</Alert>}
      {falta && paginas.hasNextPage && paginasLeidas >= PAGINAS_PARA_BUSCAR && (
        <Alert severity="info">La factura del enlace está más abajo: usa «Ver más» al final de la lista.</Alert>
      )}
      {datos.length > 0 && (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              {tabla.getHeaderGroups().map((g) => (
                <TableRow key={g.id}>
                  {g.headers.map((h) => (
                    <TableCell key={h.id} sortDirection={h.column.getIsSorted() || false}>
                      {h.column.getCanSort() ? (
                        <TableSortLabel
                          active={!!h.column.getIsSorted()}
                          direction={h.column.getIsSorted() || 'asc'}
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </TableSortLabel>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHead>
            <TableBody>
              {tabla.getRowModel().rows.map((f) => {
                const esElegida = f.original.facturaId === elegida;
                return (
                  <TableRow
                    key={f.id}
                    hover
                    selected={esElegida}
                    aria-current={esElegida ? 'true' : undefined}
                    tabIndex={esElegida ? -1 : undefined}
                    ref={
                      esElegida
                        ? (n) => {
                            if (!n || enfocada.current === elegida) return;
                            enfocada.current = elegida;
                            n.scrollIntoView?.({ block: 'center' });
                            n.focus();
                          }
                        : undefined
                    }
                    sx={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (!desdeEnlace(e)) void navegar({ to: '/servicios/$servicioId', params: { servicioId: f.original.servicioId } });
                    }}
                  >
                    {f.getVisibleCells().map((c) => (
                      <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
      {isFetchNextPageError && <Problema error={paginas.error} reintentar={() => void fetchNextPage()} />}
      {paginas.hasNextPage && !isFetchNextPageError && (
        <Button onClick={() => void paginas.fetchNextPage()} loading={paginas.isFetchingNextPage} sx={{ alignSelf: 'flex-start' }}>
          Ver más
        </Button>
      )}
    </Stack>
  );
}
