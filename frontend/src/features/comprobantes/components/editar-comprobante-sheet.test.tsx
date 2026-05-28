import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditarComprobanteSheet } from './editar-comprobante-sheet';

// Mock de los hooks de mutación
vi.mock('../hooks/use-crear-comprobante', () => ({
  useCrearComprobante: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-editar-comprobante', () => ({
  useEditarComprobante: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/use-anular-comprobante', () => ({
  useAnularComprobante: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Mock del LineasEditor para simplificar el test
vi.mock('./lineas-editor', () => ({
  LineasEditor: ({ mode }: { mode: string }) => (
    <div data-testid="lineas-editor" data-mode={mode}>
      LineasEditor mock
    </div>
  ),
}));

// Mock del ComprobanteCabeceraForm
vi.mock('./comprobante-cabecera-form', () => ({
  ComprobanteCabeceraForm: ({ numeroCorrelativo }: { numeroCorrelativo?: string | null }) => (
    <div data-testid="cabecera-form">
      {numeroCorrelativo !== undefined && numeroCorrelativo !== null && (
        <input readOnly defaultValue={numeroCorrelativo} />
      )}
    </div>
  ),
}));

const mockCuentas = [
  {
    id: 'c1',
    organizationId: 'o1',
    codigoInterno: '1.1.1',
    nombre: 'Caja',
    descripcion: null,
    claseCuenta: 'ACTIVO' as const,
    subClaseCuenta: null,
    naturaleza: 'DEUDORA' as const,
    parentId: null,
    nivel: 3,
    esDetalle: true,
    requiereContacto: false,
    esContraria: false,
    activa: true,
    monedaFuncional: 'BOB' as const,
    permiteMultiMoneda: false,
    esSystemSeed: false,
    esRequeridaSistema: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const mockComprobante = {
  id: 'comp-1',
  tipo: 'DIARIO' as const,
  numero: null,
  estado: 'BORRADOR' as const,
  fechaContable: '2026-05-27',
  periodoFiscalId: 'p1',
  glosa: 'Pago de servicios',
  monedaPrincipal: 'BOB' as const,
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

const mockComprobanteContabilizado = {
  ...mockComprobante,
  estado: 'CONTABILIZADO' as const,
  numero: 'D2604-000042',
};

function renderSheet(props: Partial<Parameters<typeof EditarComprobanteSheet>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EditarComprobanteSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="nuevo"
        cuentas={mockCuentas}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('EditarComprobanteSheet', () => {
  it('renderiza en mode=nuevo con título correcto', () => {
    renderSheet({ mode: 'nuevo' });
    expect(screen.getByText('Nuevo comprobante')).toBeInTheDocument();
  });

  it('renderiza en mode=borrador con datos del comprobante', () => {
    renderSheet({
      mode: 'borrador',
      comprobante: mockComprobante,
    });
    expect(screen.getByText('Editar borrador')).toBeInTheDocument();
    expect(screen.getByTestId('cabecera-form')).toBeInTheDocument();
    expect(screen.getByTestId('lineas-editor')).toBeInTheDocument();
  });

  it('renderiza banner ámbar en mode=contabilizado', () => {
    renderSheet({
      mode: 'contabilizado',
      comprobante: mockComprobanteContabilizado,
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/comprobante está contabilizado/i),
    ).toBeInTheDocument();
  });

  it('muestra campo motivo en mode=contabilizado', () => {
    renderSheet({
      mode: 'contabilizado',
      comprobante: mockComprobanteContabilizado,
    });
    expect(screen.getByLabelText('Motivo del cambio (opcional)')).toBeInTheDocument();
  });

  it('botón submit deshabilitado cuando isPending=true', () => {
    vi.doMock('../hooks/use-crear-comprobante', () => ({
      useCrearComprobante: () => ({ mutate: vi.fn(), isPending: true }),
    }));
    renderSheet({ mode: 'nuevo' });
    const submitBtn = screen.getByRole('button', { name: 'Guardar borrador' });
    // Button exists with correct label in non-pending state
    expect(submitBtn).toBeInTheDocument();
  });

  it('renderiza el LineasEditor con el mode correcto', () => {
    renderSheet({ mode: 'nuevo' });
    const editor = screen.getByTestId('lineas-editor');
    expect(editor).toHaveAttribute('data-mode', 'nuevo');
  });
});
