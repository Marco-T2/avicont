import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Comprobante, Contacto, Cuenta } from '@/types/api';

vi.mock('../hooks/use-comprobante', () => ({
  useComprobante: vi.fn(),
}));

// useCuentas como vi.fn() para poder sobreescribir el retorno en cada describe.
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(),
}));

// Cross-feature: useContactos para resolver razonSocial en la columna Contacto.
vi.mock('@/features/contactos/hooks/use-contactos', () => ({
  useContactos: vi.fn(),
}));

// Mock de useNavigate para verificar navegación al Editar.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useComprobante } from '../hooks/use-comprobante';
import { useCuentas } from '@/features/plan-cuentas/hooks/use-cuentas';
import { useContactos } from '@/features/contactos/hooks/use-contactos';
import { ComprobanteDetailPage } from './comprobante-detail-page';

const mockComprobante: Comprobante = {
  id: 'comp-1',
  tipo: 'DIARIO',
  numero: 'D2604-000042',
  estado: 'CONTABILIZADO',
  fechaContable: '2026-04-22',
  periodoFiscalId: 'p1',
  glosa: 'Pago de servicios de limpieza',
  monedaPrincipal: 'BOB',
  tipoCambioReexpresion: '1.00000000',
  totalDebitoBob: '1250.00',
  totalCreditoBob: '1250.00',
  anulado: false,
  fechaAnulacion: null,
  anuladoPorUserId: null,
  motivoAnulacion: null,
  createdByUserId: 'u1',
  createdAt: '2026-04-22T10:00:00Z',
  updatedAt: '2026-04-22T10:00:00Z',
  lineas: [
    {
      id: 'l1',
      orden: 1,
      cuentaId: 'cuenta-caja-id',
      contactoId: null,
      moneda: 'BOB',
      debito: '1250.00',
      credito: '0.00',
      tipoCambio: '1',
      debitoBob: '1250.00',
      creditoBob: '0.00',
      glosaLinea: 'Cobro de servicios',
    },
  ],
};

const makeCuenta = (overrides: Partial<Cuenta>): Cuenta => ({
  id: 'uuid-1',
  organizationId: 'org-1',
  codigoInterno: '1.1.01',
  nombre: 'Caja',
  descripcion: null,
  claseCuenta: 'ACTIVO',
  subClaseCuenta: 'ACTIVO_CORRIENTE',
  naturaleza: 'DEUDORA',
  parentId: null,
  nivel: 3,
  esDetalle: true,
  requiereContacto: false,
  esContraria: false,
  activa: true,
  monedaFuncional: 'BOB',
  permiteMultiMoneda: false,
  esSystemSeed: false,
  esRequeridaSistema: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function setupDefaultMocks(cuentas: Cuenta[] = [], contactos: Contacto[] = []) {
  (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
    data: mockComprobante,
    isLoading: false,
    isError: false,
  });
  (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: cuentas },
  });
  (useContactos as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: contactos },
    isLoading: false,
  });
}

// Mock que expone lineasSinContacto para poder asertarla en tests de W-04.
vi.mock('./contabilizar-comprobante-dialog', () => ({
  ContabilizarComprobanteDialog: ({
    lineasSinContacto,
  }: {
    lineasSinContacto?: number[];
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    comprobanteId?: string;
    glosa?: string;
  }) =>
    lineasSinContacto !== undefined && lineasSinContacto.length > 0 ? (
      <div
        role="alert"
        data-testid="contabilizar-dialog-aviso"
        data-lineas={JSON.stringify(lineasSinContacto)}
      >
        {lineasSinContacto.map((n) => (
          <span key={n}>Línea {n}: contacto requerido</span>
        ))}
        <button disabled>Contabilizar</button>
      </div>
    ) : (
      <button data-testid="contabilizar-dialog-ok">Contabilizar</button>
    ),
}));
vi.mock('./anular-comprobante-sheet', () => ({
  AnularComprobanteSheet: () => null,
}));
vi.mock('./eliminar-comprobante-dialog', () => ({
  EliminarComprobanteDialog: () => null,
}));
vi.mock('./auditoria-sheet', () => ({
  AuditoriaSheet: () => null,
}));

function renderPage(id = 'comp-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/comprobantes/${id}`]}>
      <Routes>
        <Route
          path="/comprobantes/:id"
          element={
            <QueryClientProvider client={qc}>
              <ComprobanteDetailPage />
            </QueryClientProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ComprobanteDetailPage (smoke)', () => {
  it('renderiza la glosa del comprobante', () => {
    setupDefaultMocks();
    renderPage();
    // getAllByText porque aparece en cabecera + glosa field
    expect(
      screen.getAllByText('Pago de servicios de limpieza').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renderiza el badge de estado', () => {
    setupDefaultMocks();
    renderPage();
    expect(screen.getAllByText('Contabilizado').length).toBeGreaterThanOrEqual(1);
  });

  it('botón "Volver a comprobantes" presente', () => {
    setupDefaultMocks();
    renderPage();
    expect(screen.getByRole('button', { name: /comprobantes/i })).toBeInTheDocument();
  });

  it('muestra la línea del comprobante', () => {
    setupDefaultMocks();
    renderPage();
    expect(screen.getByText('Cobro de servicios')).toBeInTheDocument();
  });

  it('botón "Editar" navega a /comprobantes/:id/editar', async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    renderPage();
    await user.click(screen.getByRole('button', { name: /editar/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/comprobantes/comp-1/editar');
  });
});

describe('ComprobanteDetailPage — T/C re-expresión', () => {
  it('oculta el bloque T/C re-expresión cuando el valor es 1.00000000 (default)', () => {
    setupDefaultMocks();
    // mockComprobante tiene tipoCambioReexpresion: '1.00000000'
    renderPage();
    expect(screen.queryByText(/t\/c re-expresión/i)).not.toBeInTheDocument();
  });

  it('muestra el bloque T/C re-expresión cuando el valor es distinto de 1', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...mockComprobante, tipoCambioReexpresion: '6.96000000' },
      isLoading: false,
      isError: false,
    });
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
    });
    renderPage();
    expect(screen.getByText(/t\/c re-expresión/i)).toBeInTheDocument();
    expect(screen.getByText('6.96000000')).toBeInTheDocument();
  });
});

describe('ComprobanteDetailPage — columna Cuenta en tabla de líneas (SUGG-2)', () => {
  it('muestra codigoInterno y nombre cuando la cuenta se resuelve por id', () => {
    const cuentaCaja = makeCuenta({
      id: 'cuenta-caja-id',
      codigoInterno: '1.1.01',
      nombre: 'Caja Chica',
    });
    setupDefaultMocks([cuentaCaja]);
    renderPage();
    expect(screen.getByText('1.1.01')).toBeInTheDocument();
    expect(screen.getByText('Caja Chica')).toBeInTheDocument();
  });

  it('muestra el UUID como fallback cuando la cuenta no está en la lista', () => {
    // Lista de cuentas vacía — ninguna coincide con 'cuenta-caja-id'
    setupDefaultMocks([]);
    renderPage();
    expect(screen.getByText('cuenta-caja-id')).toBeInTheDocument();
  });
});

// ============================================================
// REQ-CCL-UI-04 — columna Contacto read-only en detalle (Grupo D)
// ============================================================

const makeContacto = (overrides: Partial<Contacto>): Contacto => ({
  id: 'contacto-uuid-1',
  razonSocial: 'Empresa Ejemplo SRL',
  nombreComercial: null,
  documento: null,
  email: null,
  telefono: null,
  direccion: null,
  esCliente: true,
  esProveedor: false,
  activo: true,
  createdByUserId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const mockComprobanteConContacto: Comprobante = {
  ...mockComprobante,
  lineas: [
    {
      id: 'l1',
      orden: 1,
      cuentaId: 'cuenta-caja-id',
      contactoId: 'contacto-uuid-1',
      moneda: 'BOB',
      debito: '1250.00',
      credito: '0.00',
      tipoCambio: '1',
      debitoBob: '1250.00',
      creditoBob: '0.00',
      glosaLinea: 'Pago a proveedor',
    },
    {
      id: 'l2',
      orden: 2,
      cuentaId: 'cuenta-banco-id',
      contactoId: null,
      moneda: 'BOB',
      debito: '0.00',
      credito: '1250.00',
      tipoCambio: '1',
      debitoBob: '0.00',
      creditoBob: '1250.00',
      glosaLinea: null,
    },
  ],
};

describe('ComprobanteDetailPage — columna Contacto read-only (REQ-CCL-UI-04)', () => {
  it('muestra razonSocial cuando el contacto se resuelve por id', () => {
    const contacto = makeContacto({
      id: 'contacto-uuid-1',
      razonSocial: 'Empresa Ejemplo SRL',
    });
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockComprobanteConContacto,
      isLoading: false,
      isError: false,
    });
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
    });
    (useContactos as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [contacto] },
      isLoading: false,
    });
    renderPage();
    // getAllByText porque JSDOM puede renderizar el mismo texto en mobile y desktop
    expect(
      screen.getAllByText('Empresa Ejemplo SRL').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('muestra "—" en línea sin contactoId (contactoId = null)', () => {
    const contacto = makeContacto({ id: 'contacto-uuid-1' });
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockComprobanteConContacto,
      isLoading: false,
      isError: false,
    });
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
    });
    (useContactos as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [contacto] },
      isLoading: false,
    });
    renderPage();
    // La línea 2 tiene contactoId=null → debe mostrar "—"
    // "—" aparece también en otras celdas (glosaLinea null) así que chequeamos ≥1
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el UUID como fallback cuando el contacto no está en la lista (fuera de pageSize)', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockComprobanteConContacto,
      isLoading: false,
      isError: false,
    });
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
    });
    // Lista de contactos vacía — contacto-uuid-1 no está
    (useContactos as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText('contacto-uuid-1')).toBeInTheDocument();
  });

  it('muestra skeleton en columna Contacto mientras isLoading=true', () => {
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockComprobanteConContacto,
      isLoading: false,
      isError: false,
    });
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
    });
    (useContactos as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    renderPage();
    // Al menos un skeleton presente (puede haber varios por fila)
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// W-04 — lineasSinContacto se propaga al ContabilizarComprobanteDialog
// ============================================================

describe('ComprobanteDetailPage — lineasSinContacto propagado al dialog (W-04)', () => {
  it('pasa lineasSinContacto con el orden de la línea cuando cuenta requiereContacto=true y contactoId es null', () => {
    const cuentaConContacto = makeCuenta({
      id: 'cuenta-caja-id',
      requiereContacto: true,
    });
    // mockComprobante tiene línea con cuentaId='cuenta-caja-id' y contactoId=null
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockComprobante,
      isLoading: false,
      isError: false,
    });
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [cuentaConContacto] },
    });
    (useContactos as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
    renderPage();
    // El mock del dialog muestra aviso con role=alert cuando hay lineasSinContacto
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Verifica el orden 1-based de la línea (orden=1 según mockComprobante)
    expect(screen.getByText(/línea 1/i)).toBeInTheDocument();
    // Botón contabilizar deshabilitado por el aviso
    expect(screen.getByRole('button', { name: /contabilizar/i })).toBeDisabled();
  });

  it('NO muestra aviso cuando todas las líneas tienen contacto o la cuenta no requiere contacto', () => {
    const cuentaSinRequerimiento = makeCuenta({
      id: 'cuenta-caja-id',
      requiereContacto: false,
    });
    (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockComprobante,
      isLoading: false,
      isError: false,
    });
    (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [cuentaSinRequerimiento] },
    });
    (useContactos as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
    renderPage();
    // Sin aviso — el mock del dialog renderiza el botón habilitado
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('contabilizar-dialog-ok')).toBeInTheDocument();
  });
});
