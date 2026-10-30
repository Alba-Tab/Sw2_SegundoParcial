import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
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
import { useNavigate } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { type EstadoFactura, type Factura, getListarFacturasQueryKey, listarFacturas } from '../../api/generado/finanzas';
import { dinero, fecha } from '../../compartido/formato/formato';
import { Antiguedad } from '../../compartido/offline/Antiguedad';
import { useClienteActivo } from '../../compartido/sesion/ClienteActivo';
import { Problema } from '../../compartido/ui/Problema';
import { Credito } from './Credito';

const ESTADOS: Record<EstadoFactura, { texto: string; color: 'default' | 'success' | 'warning' }> = {
  EMITIDA: { texto: 'Por pagar', color: 'default' },
  PAGADA_PARCIAL: { texto: 'Pago parcial', color: 'warning' },
  PAGADA: { texto: 'Pagada', color: 'success' },
};

const col = createColumnHelper<Factura>();
const porMonto = (a: { monto: string }, b: { monto: string }) => Number(a.monto) - Number(b.monto);

/** Specs 006 y 008: facturas con su saldo (TanStack Table con orden) y la línea de crédito. */
export function PaginaFacturas() {
  const activo = useClienteActivo();
  const navegar = useNavigate();
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
              <Chip label={`${c.row.original.diasVencida} días vencida`} color="error" size="small" sx={{ ml: 1 }} />
            )}
          </>
        ),
      }),
      col.accessor('monto', {
        header: 'Monto',
        cell: (c) => dinero(c.getValue()),
        sortingFn: (a, b) => porMonto(a.original.monto, b.original.monto),
      }),
      col.accessor('saldo', {
        header: 'Saldo',
        cell: (c) => dinero(c.getValue()),
        sortingFn: (a, b) => porMonto(a.original.saldo, b.original.saldo),
      }),
      col.accessor('estado', {
        header: 'Estado',
        cell: (c) => <Chip label={ESTADOS[c.getValue()].texto} color={ESTADOS[c.getValue()].color} size="small" />,
      }),
    ],
    [],
  );
  const datos = useMemo(() => paginas.data?.pages.flatMap((p) => p.items) ?? [], [paginas.data]);
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
      <Typography variant="h5" component="h2">
        Facturas y crédito
      </Typography>
      <Credito />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6" component="h3">
          Facturas
        </Typography>
        <FormControlLabel control={<Switch checked={conSaldo} onChange={(e) => setConSaldo(e.target.checked)} />} label="Solo con saldo" />
      </Stack>
      {paginas.data && <Antiguedad actualizadoEn={paginas.dataUpdatedAt} fallo={paginas.isError} />}
      {paginas.isPending && paginas.fetchStatus === 'fetching' && <CircularProgress aria-label="Cargando" />}
      {paginas.isError && !paginas.data && <Problema error={paginas.error} />}
      {paginas.data && datos.length === 0 && <Typography color="text.secondary">No hay facturas.</Typography>}
      {datos.length > 0 && (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              {tabla.getHeaderGroups().map((g) => (
                <TableRow key={g.id}>
                  {g.headers.map((h) => (
                    <TableCell key={h.id} sortDirection={h.column.getIsSorted() || false}>
                      <TableSortLabel
                        active={!!h.column.getIsSorted()}
                        direction={h.column.getIsSorted() || 'asc'}
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableSortLabel>
                    </TableCell>
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
