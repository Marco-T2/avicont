import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentoFisicoDetalle, TipoDocumentoFisico } from '@/types/api';

// Mock de los hooks de tipos y contactos (usados dentro del form)
vi.mock('@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico', () => ({
  useTiposDocumentoFisico: vi.fn(),
}));

vi.mock('@/features/contactos/hooks/use-contactos', () => ({
  useContactos: vi.fn(),
}));

import { useTiposDocumentoFisico } from '@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico';
import { useContactos } from '@/features/contactos/hooks/use-contactos';

import { DocumentoFisicoForm } from './documento-fisico-form';

const mockUseTiposDocumentoFisico = vi.mocked(useTiposDocumentoFisico);
const mockUseContactos = vi.mocked(useContactos);

afterEach(() => vi.clearAllMocks());

const TIPO_TRIBUTARIO: TipoDocumentoFisico = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  nombre: 'Factura recibida',
  codigo: 'factura-recibida',
  esTributario: true,
  activo: true,
  tiposComprobanteAplicables: [],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  numeracionAutomatica: false,
  numeroInicial: null,
};

const TIPO_NO_TRIBUTARIO: TipoDocumentoFisico = {
  id: '223e4567-e89b-12d3-a456-426614174001',
  nombre: 'Comprobante interno',
  codigo: 'interno',
  esTributario: false,
  activo: true,
  tiposComprobanteAplicables: [],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  numeracionAutomatica: false,
  numeroInicial: null,
};

const DETALLE_SIN_CONTABILIZADO: Partial<DocumentoFisicoDetalle> = {
  id: 'doc-1',
  numero: 'F-001',
  fechaEmision: '2026-05-01',
  monto: '1250.50',
  moneda: 'BOB',
  glosa: null,
  tipoDocumentoFisico: {
    id: '123e4567-e89b-12d3-a456-426614174000',
    nombre: 'Factura recibida',
    codigo: 'factura-recibida',
    esTributario: true,
    numeracionAutomatica: false,
  },
  contacto: null,
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  comprobantesAsociados: [],
};

const DETALLE_CON_CONTABILIZADO: Partial<DocumentoFisicoDetalle> = {
  ...DETALLE_SIN_CONTABILIZADO,
  comprobantesAsociados: [
    { id: 'comp-1', numero: 'D2605-000001', estado: 'CONTABILIZADO' },
  ],
};

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function setupMocks(tipos: TipoDocumentoFisico[] = [TIPO_TRIBUTARIO, TIPO_NO_TRIBUTARIO]): void {
  mockUseTiposDocumentoFisico.mockReturnValue({
    data: { items: tipos, total: tipos.length, page: 1, pageSize: 50 },
    isLoading: false,
  } as ReturnType<typeof useTiposDocumentoFisico>);

  mockUseContactos.mockReturnValue({
    data: { items: [], total: 0, page: 1, pageSize: 50 },
    isLoading: false,
  } as unknown as ReturnType<typeof useContactos>);
}

describe('DocumentoFisicoForm', () => {
  it('mode=create — campos habilitados, botón Crear documento visible', () => {
    setupMocks();
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    expect(screen.getByRole('button', { name: /crear documento/i })).toBeInTheDocument();
    // numero habilitado en create
    expect(screen.getByLabelText(/número/i)).not.toBeDisabled();
  });

  it('mode=edit sin comprobantes CONTABILIZADO — numero editable', () => {
    setupMocks();
    render(
      <DocumentoFisicoForm
        mode="edit"
        comprobantesAsociados={DETALLE_SIN_CONTABILIZADO.comprobantesAsociados ?? []}
        initialValues={{
          tipoDocumentoFisicoId: '123e4567-e89b-12d3-a456-426614174000',
          numero: 'F-001',
          fechaEmision: '2026-05-01',
          monto: '1250.50',
          moneda: 'BOB',
          contactoId: null,
          glosa: null,
        }}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    expect(screen.getByLabelText(/número/i)).not.toBeDisabled();
  });

  it('mode=edit con comprobante CONTABILIZADO — numero disabled y texto de ayuda visible', () => {
    setupMocks();
    render(
      <DocumentoFisicoForm
        mode="edit"
        comprobantesAsociados={DETALLE_CON_CONTABILIZADO.comprobantesAsociados ?? []}
        initialValues={{
          tipoDocumentoFisicoId: '123e4567-e89b-12d3-a456-426614174000',
          numero: 'F-001',
          fechaEmision: '2026-05-01',
          monto: '1250.50',
          moneda: 'BOB',
          contactoId: null,
          glosa: null,
        }}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    expect(screen.getByLabelText(/número/i)).toBeDisabled();
    expect(screen.getByText(/no puede modificarse/i)).toBeInTheDocument();
  });

  it('isSubmitting=true — botón submit deshabilitado (Anti-F-07)', () => {
    setupMocks();
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        onSubmit={vi.fn()}
        isSubmitting={true}
      />,
      { wrapper: wrapper() },
    );

    const btn = screen.getByRole('button', { name: /guardando/i });
    expect(btn).toBeDisabled();
  });

  it('tipo tributario seleccionado — campos monto y moneda visibles', () => {
    // Renderizar con tipo tributario ya seleccionado
    setupMocks([TIPO_TRIBUTARIO]);
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        initialValues={{
          tipoDocumentoFisicoId: '123e4567-e89b-12d3-a456-426614174000',
          numero: '',
          fechaEmision: '',
          monto: null,
          moneda: null,
          contactoId: null,
          glosa: null,
        }}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    expect(screen.getByLabelText(/monto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/moneda/i)).toBeInTheDocument();
  });

  it('tipo no tributario seleccionado — campos monto y moneda NO presentes', () => {
    setupMocks([TIPO_NO_TRIBUTARIO]);
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        initialValues={{
          tipoDocumentoFisicoId: '223e4567-e89b-12d3-a456-426614174001',
          numero: '',
          fechaEmision: '',
          monto: null,
          moneda: null,
          contactoId: null,
          glosa: null,
        }}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    expect(screen.queryByLabelText(/monto/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/moneda/i)).not.toBeInTheDocument();
  });

  it('tipear minúsculas en numero → se convierte a uppercase en tiempo real (D7)', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    const numeroInput = screen.getByLabelText(/número/i);
    await user.type(numeroInput, 'f-001');
    expect(numeroInput).toHaveValue('F-001');
  });

  // ─── Task 6.4: campo numero oculto/disabled cuando tipo es auto ─────────────

  const TIPO_AUTO: TipoDocumentoFisico = {
    id: '323e4567-e89b-12d3-a456-426614174002',
    nombre: 'Recibo interno',
    codigo: 'recibo-interno',
    esTributario: false,
    activo: true,
    tiposComprobanteAplicables: [],
    organizationId: 'org-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    numeracionAutomatica: true,
    numeroInicial: null,
  };

  it('tipo con numeracionAutomatica=true — campo numero NO visible como input', () => {
    setupMocks([TIPO_AUTO]);
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        initialValues={{
          tipoDocumentoFisicoId: TIPO_AUTO.id,
          numero: '',
          fechaEmision: '',
          monto: null,
          moneda: null,
          contactoId: null,
          glosa: null,
        }}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    // El input de número no debe estar presente; en su lugar hay el texto de hint automático.
    expect(screen.queryByLabelText(/número/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/número asignado automáticamente por el sistema/i),
    ).toBeInTheDocument();
  });

  it('tipo con numeracionAutomatica=true — el onSubmit NO recibe numero en el payload', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    setupMocks([TIPO_AUTO]);
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        initialValues={{
          tipoDocumentoFisicoId: TIPO_AUTO.id,
          numero: '',
          fechaEmision: '2026-06-14',
          monto: null,
          moneda: null,
          contactoId: null,
          glosa: null,
        }}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    await user.click(screen.getByRole('button', { name: /crear documento/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    // numero debe ser undefined o vacío — no enviado al backend
    expect(payload['numero']).toBeUndefined();
  });

  it('tipo con numeracionAutomatica=false — campo numero visible y requerido (comportamiento manual)', () => {
    setupMocks([TIPO_NO_TRIBUTARIO]);
    render(
      <DocumentoFisicoForm
        mode="create"
        comprobantesAsociados={[]}
        initialValues={{
          tipoDocumentoFisicoId: TIPO_NO_TRIBUTARIO.id,
          numero: '',
          fechaEmision: '',
          monto: null,
          moneda: null,
          contactoId: null,
          glosa: null,
        }}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    // El input de número sí debe estar visible cuando el tipo es manual
    expect(screen.getByLabelText(/número/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/número asignado automáticamente/i),
    ).not.toBeInTheDocument();
  });
});
