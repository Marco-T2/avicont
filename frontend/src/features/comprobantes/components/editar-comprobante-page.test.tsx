import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Comprobante } from '@/types/api';

// --- Mocks ---

vi.mock('../hooks/use-comprobante', () => ({
  useComprobante: vi.fn(),
}));
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: () => ({ data: { items: [] } }),
}));
vi.mock('../hooks/use-crear-comprobante', () => ({
  useCrearComprobante: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-editar-comprobante', () => ({
  useEditarComprobante: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Evitar montar el form pesado con FormProvider + LineasEditor completo.
vi.mock('./lineas-editor', () => ({
  LineasEditor: ({ mode }: { mode: string }) => (
    <div data-testid="lineas-editor" data-mode={mode}>
      LineasEditor mock
    </div>
  ),
}));
vi.mock('./comprobante-cabecera-form', () => ({
  ComprobanteCabeceraForm: ({ numeroCorrelativo }: { numeroCorrelativo?: string | null }) => (
    <div data-testid="cabecera-form">
      {numeroCorrelativo !== undefined && numeroCorrelativo !== null && (
        <input readOnly defaultValue={numeroCorrelativo} />
      )}
    </div>
  ),
}));

import { useComprobante } from '../hooks/use-comprobante';
import { EditarComprobantePage } from './editar-comprobante-page';

// --- Fixtures ---

const mockBorrador: Comprobante = {
  id: 'comp-borrador',
  tipo: 'DIARIO',
  numero: null,
  estado: 'BORRADOR',
  fechaContable: '2026-05-27',
  periodoFiscalId: 'p1',
  glosa: 'Pago servicios',
  monedaPrincipal: 'BOB',
  totalDebitoBob: '1000.00',
  totalCreditoBob: '1000.00',
  anulado: false,
  fechaAnulacion: null,
  anuladoPorUserId: null,
  motivoAnulacion: null,
  createdByUserId: 'u1',
  createdAt: '2026-05-27T00:00:00Z',
  updatedAt: '2026-05-27T00:00:00Z',
  lineas: [],
};

const mockContabilizado: Comprobante = {
  ...mockBorrador,
  id: 'comp-cont',
  estado: 'CONTABILIZADO',
  numero: 'D2604-000042',
};

const mockAnulado: Comprobante = {
  ...mockContabilizado,
  id: 'comp-anulado',
  anulado: true,
  fechaAnulacion: '2026-05-10T00:00:00Z',
  motivoAnulacion: 'Error de imputación',
};

const mockBloqueado: Comprobante = {
  ...mockBorrador,
  id: 'comp-bloqueado',
  estado: 'BLOQUEADO',
};

// --- Helpers ---

function renderNuevo() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/comprobantes/nuevo']}>
      <Routes>
        <Route
          path="/comprobantes/nuevo"
          element={
            <QueryClientProvider client={qc}>
              <EditarComprobantePage />
            </QueryClientProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditar(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/comprobantes/${id}/editar`]}>
      <Routes>
        <Route
          path="/comprobantes/:id/editar"
          element={
            <QueryClientProvider client={qc}>
              <EditarComprobantePage />
            </QueryClientProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// --- Tests ---

describe('EditarComprobantePage — mode=nuevo', () => {
  it('renderiza título "Nuevo comprobante" sin llamar a useComprobante con id', () => {
    // En modo nuevo, id es undefined; useComprobante se llama con '' y disabled=true.
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    renderNuevo();
    expect(screen.getByText('Nuevo comprobante')).toBeInTheDocument();
    expect(screen.getByTestId('cabecera-form')).toBeInTheDocument();
    expect(screen.getByTestId('lineas-editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeInTheDocument();
  });

  it('LineasEditor recibe mode="nuevo"', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    renderNuevo();
    expect(screen.getByTestId('lineas-editor')).toHaveAttribute('data-mode', 'nuevo');
  });
});

describe('EditarComprobantePage — mode=borrador', () => {
  it('renderiza título "Editar borrador" con datos precargados', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockBorrador,
      isLoading: false,
      isError: false,
    });
    renderEditar('comp-borrador');
    expect(screen.getByText('Editar borrador')).toBeInTheDocument();
    expect(screen.getByTestId('cabecera-form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });
});

describe('EditarComprobantePage — mode=contabilizado', () => {
  it('renderiza título "Editar comprobante contabilizado" y banner ámbar', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockContabilizado,
      isLoading: false,
      isError: false,
    });
    renderEditar('comp-cont');
    expect(screen.getByText('Editar comprobante contabilizado')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/comprobante está contabilizado/i)).toBeInTheDocument();
  });

  it('muestra campo motivo', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockContabilizado,
      isLoading: false,
      isError: false,
    });
    renderEditar('comp-cont');
    expect(screen.getByLabelText('Motivo del cambio (opcional)')).toBeInTheDocument();
  });
});

describe('EditarComprobantePage — estados no editables', () => {
  it('comprobante anulado → muestra error UX, no el form', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockAnulado,
      isLoading: false,
      isError: false,
    });
    renderEditar('comp-anulado');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/no se puede editar/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cabecera-form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument();
  });

  it('comprobante bloqueado → muestra error UX, no el form', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockBloqueado,
      isLoading: false,
      isError: false,
    });
    renderEditar('comp-bloqueado');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/no se puede editar/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cabecera-form')).not.toBeInTheDocument();
  });
});

describe('EditarComprobantePage — loading y error', () => {
  it('muestra skeleton mientras carga', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = renderEditar('comp-1');
    // PageSkeleton renderiza divs con clase animate-pulse de Skeleton
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('muestra error cuando useComprobante falla', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    renderEditar('comp-inexistente');
    expect(screen.getByText(/no encontrado|no tenés acceso/i)).toBeInTheDocument();
  });
});
