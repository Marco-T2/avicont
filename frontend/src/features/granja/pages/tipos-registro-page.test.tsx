import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TipoRegistroResponse } from '../api/granja.types';
import { TiposRegistroPage } from './tipos-registro-page';

const { deleteMock } = vi.hoisted(() => ({ deleteMock: vi.fn() }));

vi.mock('../hooks/use-granja-queries', () => ({
  useTiposRegistro: vi.fn(),
}));
vi.mock('../hooks/use-granja-mutations', () => ({
  useCreateTipoRegistro: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTipoRegistro: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTipoRegistro: () => ({ mutate: deleteMock, isPending: false }),
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

import { useTiposRegistro } from '../hooks/use-granja-queries';

const tipoPropio: TipoRegistroResponse = {
  id: 'tipo-propio-1',
  nombre: 'Suplementos',
  naturaleza: 'INVERSION',
  esSistema: false,
  activo: true,
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  deleteMock.mockClear();
  vi.mocked(useTiposRegistro).mockReturnValue({
    data: [tipoPropio],
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useTiposRegistro>);
});

describe('TiposRegistroPage — eliminar con confirmación', () => {
  it('no elimina al primer clic; pide confirmación antes de mutar', async () => {
    const user = userEvent.setup();
    render(<TiposRegistroPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /eliminar suplementos/i }));

    // El primer clic abre el diálogo, NO dispara la mutación.
    expect(deleteMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/no se puede deshacer/i)).toBeInTheDocument();
  });

  it('elimina recién al confirmar en el diálogo', async () => {
    const user = userEvent.setup();
    render(<TiposRegistroPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /eliminar suplementos/i }));
    await user.click(screen.getByRole('button', { name: /^eliminar$/i }));

    expect(deleteMock).toHaveBeenCalledWith('tipo-propio-1', expect.anything());
  });
});
