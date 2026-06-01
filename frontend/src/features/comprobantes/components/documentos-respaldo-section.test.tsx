import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Comprobante, DocumentoFisico } from '@/types/api';

// Mocks de los hooks que la sección consume
vi.mock('../hooks/use-documentos-asociados', () => ({
  useDocumentosAsociados: vi.fn(),
}));
vi.mock('../hooks/use-desasociar-documento', () => ({
  useDesasociarDocumento: vi.fn(),
}));
// Mock del combobox para aislar la sección (el combobox tiene sus propios tests)
vi.mock('./documento-fisico-combobox', () => ({
  DocumentoFisicoCombobox: () => <div data-testid="combobox-mock">Combobox</div>,
}));
// La card (real) ahora gatea el botón desasociar con usePermissions vía
// PermissionButton; lo mockeamos para controlar el gating.
vi.mock('@/lib/use-permissions', () => ({
  usePermissions: vi.fn(),
}));

import { useDocumentosAsociados } from '../hooks/use-documentos-asociados';
import { useDesasociarDocumento } from '../hooks/use-desasociar-documento';
import { usePermissions } from '@/lib/use-permissions';
import { DocumentosRespaldoSection } from './documentos-respaldo-section';

// Usamos `as unknown as` para satisfacer el tipo del mock sin import completo.
const mockUseDocumentosAsociados = useDocumentosAsociados as unknown as ReturnType<typeof vi.fn>;
const mockUseDesasociarDocumento = useDesasociarDocumento as unknown as ReturnType<typeof vi.fn>;
const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

function setPerms(granted: string[] | 'all'): void {
  const has = (p: string): boolean => granted === 'all' || granted.includes(p);
  mockUsePermissions.mockReturnValue({
    has,
    hasAll: (perms: string[]) => perms.every(has),
    isOwner: granted === 'all',
    permissions: granted === 'all' ? [] : granted,
  } as unknown as ReturnType<typeof usePermissions>);
}

// Por default los tests preexistentes asumen permiso total.
beforeEach(() => {
  setPerms('all');
});

// Desasociar mutation mock base (vacío, sin estado pending)
const desasociarMock = {
  mutate: vi.fn(),
  isPending: false,
  variables: undefined,
};

function makeQc(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const baseComprobante: Comprobante = {
  id: 'comp-1',
  tipo: 'EGRESO',
  numero: 'E2604-000001',
  estado: 'BORRADOR',
  fechaContable: '2026-05-01',
  periodoFiscalId: 'p1',
  glosa: 'Pago de proveedor',
  monedaPrincipal: 'BOB',
  tipoCambioReexpresion: '1.00000000',
  totalDebitoBob: '1000.00',
  totalCreditoBob: '1000.00',
  anulado: false,
  fechaAnulacion: null,
  anuladoPorUserId: null,
  motivoAnulacion: null,
  createdByUserId: 'u1',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  lineas: [],
};

const doc1: DocumentoFisico = {
  id: 'doc-1',
  numero: 'F-001',
  fechaEmision: '2026-05-01',
  monto: '500.00',
  moneda: 'BOB',
  glosa: null,
  tipoDocumentoFisico: {
    id: 'tipo-1',
    nombre: 'Factura recibida',
    codigo: 'factura',
    esTributario: true,
  },
  contacto: null,
  organizationId: 'org-1',
  createdAt: '2026-05-01T00:00:00Z',
};

const doc2: DocumentoFisico = {
  ...doc1,
  id: 'doc-2',
  numero: 'REC-001',
  monto: null,
  moneda: null,
  tipoDocumentoFisico: {
    id: 'tipo-2',
    nombre: 'Recibo interno',
    codigo: 'recibo',
    esTributario: false,
  },
};

function renderSection(comprobante: Comprobante, editable: boolean): void {
  const qc = makeQc();
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={0}>
        <DocumentosRespaldoSection comprobante={comprobante} editable={editable} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('DocumentosRespaldoSection — gating editable/read-only', () => {
  it('BORRADOR + editable=true → muestra combobox y botones desasociar', () => {
    mockUseDocumentosAsociados.mockReturnValue({ data: [doc1], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(baseComprobante, true);

    // Combobox visible
    expect(screen.getByTestId('combobox-mock')).toBeInTheDocument();
    // Botón desasociar visible
    expect(screen.getByRole('button', { name: /desasociar/i })).toBeInTheDocument();
  });

  it('CONTABILIZADO período abierto + editable=true → muestra combobox', () => {
    const contabilizado: Comprobante = {
      ...baseComprobante,
      estado: 'CONTABILIZADO',
      numero: 'E2604-000002',
    };
    mockUseDocumentosAsociados.mockReturnValue({ data: [], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(contabilizado, true);

    expect(screen.getByTestId('combobox-mock')).toBeInTheDocument();
  });

  it('BLOQUEADO + editable=false → oculta combobox y botones desasociar', () => {
    const bloqueado: Comprobante = {
      ...baseComprobante,
      estado: 'BLOQUEADO',
      numero: 'E2604-000003',
    };
    mockUseDocumentosAsociados.mockReturnValue({ data: [doc1], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(bloqueado, false);

    expect(screen.queryByTestId('combobox-mock')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desasociar/i })).not.toBeInTheDocument();
  });

  it('anulado + editable=false → oculta combobox y botones desasociar', () => {
    const anulado: Comprobante = {
      ...baseComprobante,
      anulado: true,
      estado: 'CONTABILIZADO',
    };
    mockUseDocumentosAsociados.mockReturnValue({ data: [doc1], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(anulado, false);

    expect(screen.queryByTestId('combobox-mock')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desasociar/i })).not.toBeInTheDocument();
  });
});

describe('DocumentosRespaldoSection — gating de permisos (desasociar)', () => {
  it('editable=true CON permiso → botón desasociar habilitado', () => {
    setPerms([
      'contabilidad.documentos-fisicos.update',
      'contabilidad.asientos.update',
    ]);
    mockUseDocumentosAsociados.mockReturnValue({ data: [doc1], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(baseComprobante, true);

    expect(screen.getByRole('button', { name: /desasociar/i })).toBeEnabled();
  });

  it('editable=true SIN permiso (falta asientos.update) → botón desasociar deshabilitado', () => {
    setPerms(['contabilidad.documentos-fisicos.update']);
    mockUseDocumentosAsociados.mockReturnValue({ data: [doc1], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(baseComprobante, true);

    // La affordance se ve (no se oculta) pero está deshabilitada — patrón #87.
    expect(screen.getByRole('button', { name: /desasociar/i })).toBeDisabled();
  });
});

describe('DocumentosRespaldoSection — lista de documentos', () => {
  it('lista con 2 documentos → muestra tipo y número de cada uno', () => {
    mockUseDocumentosAsociados.mockReturnValue({ data: [doc1, doc2], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(baseComprobante, false);

    // Verifica que aparecen los números de los documentos
    expect(screen.getByText('F-001')).toBeInTheDocument();
    expect(screen.getByText('REC-001')).toBeInTheDocument();
    // Verifica tipo
    expect(screen.getByText('Factura recibida')).toBeInTheDocument();
    expect(screen.getByText('Recibo interno')).toBeInTheDocument();
    // Tributario muestra monto; no tributario no
    expect(screen.getByText(/500\.00/)).toBeInTheDocument();
  });

  it('lista vacía → muestra estado vacío sin error', () => {
    mockUseDocumentosAsociados.mockReturnValue({ data: [], isLoading: false });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(baseComprobante, false);

    expect(screen.getByText(/sin documentos de respaldo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desasociar/i })).not.toBeInTheDocument();
  });

  it('isLoading=true → muestra skeletons (no lista, no empty state)', () => {
    mockUseDocumentosAsociados.mockReturnValue({ data: undefined, isLoading: true });
    mockUseDesasociarDocumento.mockReturnValue(desasociarMock);

    renderSection(baseComprobante, false);

    // En loading no hay texto de "sin documentos" ni números
    expect(screen.queryByText(/sin documentos de respaldo/i)).not.toBeInTheDocument();
    expect(screen.queryByText('F-001')).not.toBeInTheDocument();
  });
});
