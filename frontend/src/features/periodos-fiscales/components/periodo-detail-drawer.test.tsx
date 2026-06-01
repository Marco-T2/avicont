import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ResumenPrecierre } from '@/types/api';

import { PeriodoDetailDrawer } from './periodo-detail-drawer';

vi.mock('../hooks/use-resumen-precierre', () => ({
  useResumenPrecierre: vi.fn(),
}));
vi.mock('../hooks/use-cerrar-periodo', () => ({
  useCerrarPeriodo: vi.fn(),
}));
vi.mock('../hooks/use-cerrar-gestion', () => ({
  useCerrarGestion: vi.fn(),
}));
vi.mock('../hooks/use-gestion-detalle', () => ({
  useGestionDetalle: vi.fn(),
}));
vi.mock('@/lib/use-permissions', () => ({
  usePuedeReabrir: vi.fn(),
  // El botón "Cerrar período" usa PermissionButton → usePermissions. Concedemos
  // todo (estos tests no se ocupan del gating de permisos, sino del flujo).
  usePermissions: () => ({
    has: () => true,
    hasAll: () => true,
    isOwner: true,
    permissions: [],
  }),
}));

import { useResumenPrecierre } from '../hooks/use-resumen-precierre';
import { useCerrarPeriodo } from '../hooks/use-cerrar-periodo';
import { useCerrarGestion } from '../hooks/use-cerrar-gestion';
import { useGestionDetalle } from '../hooks/use-gestion-detalle';
import { usePuedeReabrir } from '@/lib/use-permissions';

const mockedUseResumenPrecierre = useResumenPrecierre as ReturnType<typeof vi.fn>;
const mockedUseCerrarPeriodo = useCerrarPeriodo as ReturnType<typeof vi.fn>;
const mockedUseCerrarGestion = useCerrarGestion as ReturnType<typeof vi.fn>;
const mockedUseGestionDetalle = useGestionDetalle as ReturnType<typeof vi.fn>;
const mockedUsePuedeReabrir = usePuedeReabrir as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeResumen(overrides: Partial<ResumenPrecierre> = {}): ResumenPrecierre {
  return {
    periodo: {
      id: 'p1',
      year: 2026,
      month: 1,
      ordenEnGestion: 1,
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-31',
    },
    comprobantes: { contabilizados: 5, borradores: 0, anulados: 1 },
    totalesBob: { totalDebe: '10000.00', totalHaber: '10000.00', balanceado: true },
    borradoresPendientes: [],
    puedeCerrar: true,
    ...overrides,
  };
}

function stubCerrar() {
  return { mutate: vi.fn(), isPending: false };
}

function setupDefaults() {
  mockedUseCerrarPeriodo.mockReturnValue(stubCerrar());
  mockedUseCerrarGestion.mockReturnValue(stubCerrar());
  mockedUseGestionDetalle.mockReturnValue({ data: undefined, isLoading: false });
  mockedUsePuedeReabrir.mockReturnValue(false);
}

describe('PeriodoDetailDrawer', () => {
  it('muestra skeleton mientras carga', () => {
    setupDefaults();
    mockedUseResumenPrecierre.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(
      <PeriodoDetailDrawer
        periodoId="p1"
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="ABIERTA"
      />,
      { wrapper: wrapper() },
    );
    // Skeleton tiene aria no accesible, pero el drawer debe estar en DOM
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sin borradores → botón "Cerrar período" habilitado', async () => {
    setupDefaults();
    mockedUseResumenPrecierre.mockReturnValue({
      data: makeResumen({ puedeCerrar: true, borradoresPendientes: [] }),
      isLoading: false,
      isError: false,
    });
    render(
      <PeriodoDetailDrawer
        periodoId="p1"
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="ABIERTA"
      />,
      { wrapper: wrapper() },
    );
    const btn = await screen.findByRole('button', { name: /cerrar período/i });
    expect(btn).not.toBeDisabled();
  });

  it('con borradores → botón "Cerrar período" deshabilitado + lista visible', async () => {
    setupDefaults();
    mockedUseResumenPrecierre.mockReturnValue({
      data: makeResumen({
        puedeCerrar: false,
        comprobantes: { contabilizados: 3, borradores: 2, anulados: 0 },
        borradoresPendientes: [
          { id: 'b1', numero: null, fechaContable: '2026-01-05', glosa: 'Pago proveedor ABC', total: '500.00' },
          { id: 'b2', numero: null, fechaContable: '2026-01-10', glosa: 'Compra materiales', total: '1200.00' },
        ],
        razonNoPuedeCerrar: 'Hay comprobantes en borrador',
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <PeriodoDetailDrawer
        periodoId="p1"
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="ABIERTA"
      />,
      { wrapper: wrapper() },
    );
    const btn = await screen.findByRole('button', { name: /cerrar período/i });
    expect(btn).toBeDisabled();
    expect(await screen.findByText('Pago proveedor ABC')).toBeInTheDocument();
    expect(await screen.findByText('Compra materiales')).toBeInTheDocument();
    expect(await screen.findByText(/Hay comprobantes en borrador/i)).toBeInTheDocument();
  });

  it('rol CONTADOR (usePuedeReabrir false) → botón Reabrir NO se renderiza', async () => {
    setupDefaults();
    mockedUsePuedeReabrir.mockReturnValue(false);
    // período cerrado para que el botón reabrir aplique
    mockedUseResumenPrecierre.mockReturnValue({
      data: makeResumen({ puedeCerrar: false }),
      isLoading: false,
      isError: false,
    });
    render(
      <PeriodoDetailDrawer
        periodoId="p1"
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="ABIERTA"
      />,
      { wrapper: wrapper() },
    );
    await screen.findByRole('button', { name: /cerrar período/i });
    expect(screen.queryByRole('button', { name: /reabrir/i })).not.toBeInTheDocument();
  });

  it('OWNER (usePuedeReabrir true) con período cerrado → botón Reabrir visible', async () => {
    setupDefaults();
    mockedUsePuedeReabrir.mockReturnValue(true);
    mockedUseResumenPrecierre.mockReturnValue({
      data: makeResumen({ puedeCerrar: false }),
      isLoading: false,
      isError: false,
    });
    // periodoId null — el drawer cierra (sin periodoId no renderiza sheet abierto)
    render(
      <PeriodoDetailDrawer
        periodoId="p1"
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="CERRADA"
      />,
      { wrapper: wrapper() },
    );
    // Con gestionStatus CERRADA y OWNER, el botón reabrir debe aparecer
    const btn = await screen.findByRole('button', { name: /reabrir/i });
    expect(btn).toBeInTheDocument();
  });

  it('periodoId null → drawer cerrado (sin contenido)', () => {
    setupDefaults();
    mockedUseResumenPrecierre.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    const { container } = render(
      <PeriodoDetailDrawer
        periodoId={null}
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="ABIERTA"
      />,
      { wrapper: wrapper() },
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('click en "Cerrar período" llama a cerrarPeriodo mutation', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseCerrarPeriodo.mockReturnValue({ mutate, isPending: false });
    mockedUseCerrarGestion.mockReturnValue(stubCerrar());
    mockedUseGestionDetalle.mockReturnValue({ data: undefined, isLoading: false });
    mockedUsePuedeReabrir.mockReturnValue(false);
    mockedUseResumenPrecierre.mockReturnValue({
      data: makeResumen({ puedeCerrar: true }),
      isLoading: false,
      isError: false,
    });
    render(
      <PeriodoDetailDrawer
        periodoId="p1"
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="ABIERTA"
      />,
      { wrapper: wrapper() },
    );
    const btn = await screen.findByRole('button', { name: /cerrar período/i });
    await user.click(btn);
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith('p1', expect.any(Object));
    });
  });

  it('muestra contadores de comprobantes', async () => {
    setupDefaults();
    mockedUseResumenPrecierre.mockReturnValue({
      data: makeResumen({
        comprobantes: { contabilizados: 8, borradores: 3, anulados: 2 },
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <PeriodoDetailDrawer
        periodoId="p1"
        gestionId="g1"
        onOpenChange={vi.fn()}
        gestionStatus="ABIERTA"
      />,
      { wrapper: wrapper() },
    );
    expect(await screen.findByText('8')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
