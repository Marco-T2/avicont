import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  LoteResponse,
  MovimientosResponse,
  TipoRegistroResponse,
} from '../api/granja.types';
import { LoteDetailPage } from './lote-detail-page';

const { deleteMock } = vi.hoisted(() => ({ deleteMock: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'lote-1' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../hooks/use-granja-queries', () => ({
  useLote: vi.fn(),
  useMovimientos: vi.fn(),
  useTiposRegistro: vi.fn(),
}));
vi.mock('../hooks/use-granja-mutations', () => ({
  useCerrarLote: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateMovimientoInversion: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateMovimientoCantidad: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMovimiento: () => ({ mutate: deleteMock, isPending: false }),
}));
vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: () => true,
    hasAll: () => true,
    isOwner: true,
    permissions: [],
  }),
}));

import { useLote, useMovimientos, useTiposRegistro } from '../hooks/use-granja-queries';

const lote: LoteResponse = {
  id: 'lote-1',
  nombre: 'Lote Junio',
  cantidadInicial: 5000,
  fechaIngreso: '2026-06-01',
  fechaEstimadaSaca: null,
  fechaCierre: null,
  galpon: 'El Alto',
  detalle: null,
  estado: 'ACTIVO',
  organizationId: 'org-1',
  resumen: {
    avesVivas: 4900,
    costoAcumulado: '12000.00',
    costoPorPolloVivo: '2.45',
    porcentajeMortalidad: 0.02,
    edadDias: 10,
  },
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

const movimientos: MovimientosResponse = {
  inversiones: [
    {
      id: 'inv-1',
      loteId: 'lote-1',
      tipoRegistroId: 'tipo-alimento',
      monto: '500.00',
      detalle: null,
      fecha: '2026-06-02',
      createdAt: '2026-06-02T00:00:00Z',
    },
  ],
  cantidades: [],
};

const tipos: TipoRegistroResponse[] = [
  {
    id: 'tipo-alimento',
    nombre: 'Alimento',
    naturaleza: 'INVERSION',
    esSistema: true,
    activo: true,
    organizationId: 'org-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  deleteMock.mockClear();
  vi.mocked(useLote).mockReturnValue({
    data: lote,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useLote>);
  vi.mocked(useMovimientos).mockReturnValue({
    data: movimientos,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useMovimientos>);
  vi.mocked(useTiposRegistro).mockReturnValue({
    data: tipos,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useTiposRegistro>);
});

describe('LoteDetailPage — registro directo (sin pestañas)', () => {
  it('el botón "Registrar gasto" abre el formulario de gasto', async () => {
    const user = userEvent.setup();
    render(<LoteDetailPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /registrar gasto/i }));

    // El form de gasto es el único con el campo "Monto".
    expect(await screen.findByLabelText(/monto/i)).toBeInTheDocument();
  });

  it('el botón "Registrar mortalidad" abre el formulario de mortalidad', async () => {
    const user = userEvent.setup();
    render(<LoteDetailPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /registrar mortalidad/i }));

    // El form de mortalidad es el único con el campo "Cantidad".
    expect(await screen.findByLabelText(/cantidad/i)).toBeInTheDocument();
  });

  it('muestra las secciones Gastos y Mortalidad sin pestañas que cambiar', () => {
    render(<LoteDetailPage />, { wrapper });

    expect(screen.getByRole('heading', { name: /^gastos$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^mortalidad$/i })).toBeInTheDocument();
  });
});

describe('LoteDetailPage — eliminar movimiento con confirmación', () => {
  it('no elimina al primer clic; pide confirmación antes de mutar', async () => {
    const user = userEvent.setup();
    render(<LoteDetailPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /eliminar movimiento/i }));

    expect(deleteMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/no se puede deshacer/i)).toBeInTheDocument();
  });

  it('elimina el movimiento correcto recién al confirmar', async () => {
    const user = userEvent.setup();
    render(<LoteDetailPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /eliminar movimiento/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^eliminar$/i }));

    expect(deleteMock).toHaveBeenCalledWith(
      { tipo: 'inversion', movId: 'inv-1' },
      expect.anything(),
    );
  });
});
