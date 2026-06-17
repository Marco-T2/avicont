import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

// ── Mocks (antes de imports que los usan) ───────────────────────────────────

// Permisos — grant all by default, tests individuales pueden overridear.
const hasMock = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn: ReturnType<typeof vi.fn> & ((p: string) => boolean) = vi.fn(() => true) as any;
  return fn;
});

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: (p: string) => hasMock(p),
    hasAll: () => true,
    isOwner: false,
    permissions: [],
  }),
}));

// Hooks de la feature
vi.mock('../hooks/use-cierre', () => ({ useCierre: vi.fn() }));
vi.mock('../hooks/use-generar-cierre', () => ({
  useGenerarCierre: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
}));
vi.mock('../hooks/use-contabilizar-cierre', () => ({
  useContabilizarCierre: vi.fn(() => ({
    contabilizar: vi.fn(),
    progreso: [],
    isPending: false,
  })),
}));

// Cross-feature hooks que usan los sub-componentes
vi.mock('@/features/comprobantes/hooks/use-comprobante', () => ({
  useComprobante: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}));
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
}));
vi.mock('@/features/contactos/hooks/use-contactos', () => ({
  useContactos: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
}));

// Toast — para que no explote en tests
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { useCierre } from '../hooks/use-cierre';
import { CierreEjercicioPage } from './cierre-ejercicio-page';

const mockUseCierre = useCierre as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/gestiones/gestion-1/cierre']}>
          <Routes>
            <Route path="/gestiones/:id/cierre" element={children} />
            <Route path="/periodos-fiscales" element={<div>periodos-fiscales-sentinel</div>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('CierreEjercicioPage', () => {
  it('isLoading: true → muestra skeletons, sin botones de acción ni empty state (REQ-CEF-08)', () => {
    mockUseCierre.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(<CierreEjercicioPage />, { wrapper });

    // Debe haber skeletons
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    // No debe haber botones de generar/contabilizar
    expect(screen.queryByRole('button', { name: /generar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contabilizar/i })).not.toBeInTheDocument();
  });

  it('isError: true → banner de error + botón "Volver a gestiones" (REQ-CEF-07)', () => {
    mockUseCierre.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<CierreEjercicioPage />, { wrapper });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /volver a gestiones/i })).toBeInTheDocument();
  });

  it('SIN_CIERRES + con permiso → empty state con botón "Generar asientos de cierre" habilitado (REQ-CEF-02)', () => {
    mockUseCierre.mockReturnValue({
      data: { gestionId: 'gestion-1', cierres: [] },
      isLoading: false,
      isError: false,
    });
    hasMock.mockReturnValue(true);

    render(<CierreEjercicioPage />, { wrapper });

    expect(screen.getByText(/no hay asientos de cierre/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generar asientos/i })).not.toBeDisabled();
  });

  it('SIN_CIERRES sin permiso gestiones.cerrar → botón "Generar" disabled (REQ-CEF-02)', () => {
    mockUseCierre.mockReturnValue({
      data: { gestionId: 'gestion-1', cierres: [] },
      isLoading: false,
      isError: false,
    });
    // Sin permiso de cerrar
    hasMock.mockImplementation(
      (p: string) => p !== 'contabilidad.gestiones.cerrar',
    );

    render(<CierreEjercicioPage />, { wrapper });

    const btn = screen.getByRole('button', { name: /generar asientos/i });
    expect(btn).toBeDisabled();
  });

  it('EN_BORRADOR con N=2 → 2 AsientoCierreCard + botón "Regenerar" + ContabilizarCierreBar (REQ-CEF-04)', () => {
    mockUseCierre.mockReturnValue({
      data: {
        gestionId: 'gestion-1',
        cierres: [
          { id: 'c-1', origenTipo: 'CIERRE_GASTOS', estado: 'BORRADOR' },
          { id: 'c-2', origenTipo: 'CIERRE_INGRESOS', estado: 'BORRADOR' },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hasMock.mockReturnValue(true);

    render(<CierreEjercicioPage />, { wrapper });

    expect(screen.getByText('Cierre de gastos y costos')).toBeInTheDocument();
    expect(screen.getByText('Cierre de ingresos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contabilizar cierre/i })).toBeInTheDocument();
  });

  it('EN_BORRADOR con N=3 → 3 AsientoCierreCard (REQ-CEF-04)', () => {
    mockUseCierre.mockReturnValue({
      data: {
        gestionId: 'gestion-1',
        cierres: [
          { id: 'c-1', origenTipo: 'CIERRE_GASTOS', estado: 'BORRADOR' },
          { id: 'c-2', origenTipo: 'CIERRE_INGRESOS', estado: 'BORRADOR' },
          { id: 'c-3', origenTipo: 'CIERRE_RESULTADO', estado: 'BORRADOR' },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hasMock.mockReturnValue(true);

    render(<CierreEjercicioPage />, { wrapper });

    expect(screen.getByText('Cierre de gastos y costos')).toBeInTheDocument();
    expect(screen.getByText('Cierre de ingresos')).toBeInTheDocument();
    expect(screen.getByText('Traslado del resultado')).toBeInTheDocument();
  });

  it('PARCIALMENTE_CONTABILIZADO → banner informativo + botón "Regenerar" disabled (REQ-CEF-03, D-3)', () => {
    mockUseCierre.mockReturnValue({
      data: {
        gestionId: 'gestion-1',
        cierres: [
          { id: 'c-1', origenTipo: 'CIERRE_GASTOS', estado: 'CONTABILIZADO' },
          { id: 'c-2', origenTipo: 'CIERRE_INGRESOS', estado: 'BORRADOR' },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hasMock.mockReturnValue(true);

    render(<CierreEjercicioPage />, { wrapper });

    // Banner informativo del estado parcial
    expect(screen.getByText(/parcialmente contabilizado/i)).toBeInTheDocument();
    // Botón Regenerar debe estar deshabilitado
    const btnRegenerar = screen.getByRole('button', { name: /regenerar/i });
    expect(btnRegenerar).toBeDisabled();
  });

  it('TODOS_CONTABILIZADO → CierreConfirmadoBanner visible + sin ContabilizarCierreBar (REQ-CEF-06)', () => {
    mockUseCierre.mockReturnValue({
      data: {
        gestionId: 'gestion-1',
        cierres: [
          { id: 'c-1', origenTipo: 'CIERRE_GASTOS', estado: 'CONTABILIZADO' },
          { id: 'c-2', origenTipo: 'CIERRE_INGRESOS', estado: 'CONTABILIZADO' },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hasMock.mockReturnValue(true);

    render(<CierreEjercicioPage />, { wrapper });

    expect(screen.getByText(/cierre del ejercicio contabilizado correctamente/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cerrar gestión/i })).toBeInTheDocument();
    // No hay ContabilizarCierreBar en estado final
    expect(screen.queryByRole('button', { name: /contabilizar cierre/i })).not.toBeInTheDocument();
  });
});
