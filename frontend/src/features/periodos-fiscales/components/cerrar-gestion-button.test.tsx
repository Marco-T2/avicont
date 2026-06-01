import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { GestionConPeriodos } from '@/types/api';

import { CerrarGestionButton } from './cerrar-gestion-button';

vi.mock('../hooks/use-gestion-detalle', () => ({
  useGestionDetalle: vi.fn(),
}));
vi.mock('../hooks/use-cerrar-gestion', () => ({
  useCerrarGestion: vi.fn(),
}));
// El botón usa PermissionButton → usePermissions. Concedemos todo (estos tests
// cubren el flujo de cierre, no el gating de permisos).
vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({ has: () => true, hasAll: () => true, isOwner: true, permissions: [] }),
}));

import { useGestionDetalle } from '../hooks/use-gestion-detalle';
import { useCerrarGestion } from '../hooks/use-cerrar-gestion';

const mockedUseGestionDetalle = useGestionDetalle as ReturnType<typeof vi.fn>;
const mockedUseCerrarGestion = useCerrarGestion as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeGestion(allClosed: boolean, partial = false): GestionConPeriodos {
  const periodos = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`,
    gestionId: 'g1',
    year: 2026,
    month: i + 1,
    ordenEnGestion: i + 1,
    // Si partial=true, dejar el último abierto; si no, allClosed controla todos
    status: partial && i === 11 ? ('ABIERTO' as const) : allClosed ? ('CERRADO' as const) : ('ABIERTO' as const),
    esDefinitivo: false,
    closedAt: allClosed && (!partial || i < 11) ? '2026-02-01T00:00:00Z' : null,
    closedByUserId: allClosed && (!partial || i < 11) ? 'u1' : null,
    fechaInicio: `2026-0${String(i + 1).padStart(2, '0')}-01`,
    fechaFin: `2026-0${String(i + 1).padStart(2, '0')}-28`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }));
  return {
    id: 'g1',
    year: 2026,
    mesInicio: 1,
    mesCierre: 12,
    status: 'ABIERTA',
    closedAt: null,
    closedByUserId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    fechaInicio: '2026-01-01',
    fechaFin: '2026-12-31',
    tipoEmpresaPrincipal: 'COMERCIAL',
    periodos,
  };
}

describe('CerrarGestionButton', () => {
  it('12/12 cerrados → botón "Cerrar gestión" habilitado', async () => {
    mockedUseCerrarGestion.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockedUseGestionDetalle.mockReturnValue({
      data: makeGestion(true),
      isLoading: false,
    });
    render(<CerrarGestionButton gestionId="g1" />, { wrapper: wrapper() });
    const btn = await screen.findByRole('button', { name: /cerrar gestión/i });
    expect(btn).not.toBeDisabled();
  });

  it('11/12 cerrados (1 abierto) → botón NO se renderiza', async () => {
    mockedUseCerrarGestion.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockedUseGestionDetalle.mockReturnValue({
      data: makeGestion(false, true),
      isLoading: false,
    });
    render(<CerrarGestionButton gestionId="g1" />, { wrapper: wrapper() });
    // No debe aparecer el botón
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cerrar gestión/i })).not.toBeInTheDocument();
    });
  });

  it('click + error GESTION_CON_PERIODOS_ABIERTOS → mutate llama onError', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn().mockImplementation(
      (_id: string, opts: { onError: (e: unknown) => void }) => {
        opts.onError({
          response: {
            data: {
              code: 'GESTION_CON_PERIODOS_ABIERTOS',
              details: {
                periodosAbiertos: [{ year: 2026, month: 8 }],
              },
            },
          },
        });
      },
    );
    mockedUseCerrarGestion.mockReturnValue({ mutate, isPending: false });
    mockedUseGestionDetalle.mockReturnValue({
      data: makeGestion(true),
      isLoading: false,
    });
    render(<CerrarGestionButton gestionId="g1" />, { wrapper: wrapper() });
    const btn = await screen.findByRole('button', { name: /cerrar gestión/i });
    await user.click(btn);
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith('g1', expect.any(Object));
    });
  });

  it('isPending → botón deshabilitado con spinner', async () => {
    mockedUseCerrarGestion.mockReturnValue({ mutate: vi.fn(), isPending: true });
    mockedUseGestionDetalle.mockReturnValue({
      data: makeGestion(true),
      isLoading: false,
    });
    render(<CerrarGestionButton gestionId="g1" />, { wrapper: wrapper() });
    const btn = await screen.findByRole('button', { name: /cerrando/i });
    expect(btn).toBeDisabled();
  });

  it('gestionId null → no renderiza nada', () => {
    mockedUseCerrarGestion.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockedUseGestionDetalle.mockReturnValue({ data: undefined, isLoading: false });
    const { container } = render(<CerrarGestionButton gestionId={null} />, {
      wrapper: wrapper(),
    });
    expect(container).toBeEmptyDOMElement();
  });
});
