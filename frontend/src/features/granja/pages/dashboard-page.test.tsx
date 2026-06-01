import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoteDashboardItem } from '../api/granja.types';
import { GranjaDashboardPage } from './dashboard-page';

const { cerrarMock } = vi.hoisted(() => ({ cerrarMock: vi.fn() }));

vi.mock('../hooks/use-granja-queries', () => ({
  useDashboard: vi.fn(),
}));
vi.mock('../hooks/use-granja-mutations', () => ({
  useCerrarLote: () => ({ mutate: cerrarMock, isPending: false }),
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

import { useDashboard } from '../hooks/use-granja-queries';

const lote: LoteDashboardItem = {
  id: 'lote-1',
  nombre: 'Lote Junio El Alto',
  galpon: 'El Alto',
  estado: 'ACTIVO',
  cantidadInicial: 5000,
  fechaIngreso: '2026-06-01',
  edadDias: 10,
  avesVivas: 4900,
  costoAcumulado: '12000.00',
  costoPorPolloVivo: '2.45',
  porcentajeMortalidad: 0.02,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cerrarMock.mockClear();
  vi.mocked(useDashboard).mockReturnValue({
    data: [lote],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useDashboard>);
});

describe('GranjaDashboardPage — cerrar lote con confirmación', () => {
  it('no cierra al primer clic; pide confirmación antes de mutar', async () => {
    const user = userEvent.setup();
    render(<GranjaDashboardPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /cerrar lote/i }));

    expect(cerrarMock).not.toHaveBeenCalled();
    // El diálogo nombra el lote para que el usuario sepa qué está cerrando.
    expect(await screen.findByText(/¿cerrar lote junio el alto\?/i)).toBeInTheDocument();
  });

  it('cierra recién al confirmar en el diálogo', async () => {
    const user = userEvent.setup();
    render(<GranjaDashboardPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /cerrar lote/i }));
    // Confirmación scopeada al AlertDialog (la card también tiene "Cerrar lote").
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /cerrar lote/i }));

    expect(cerrarMock).toHaveBeenCalledWith('lote-1', expect.anything());
  });
});
