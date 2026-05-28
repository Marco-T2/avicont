import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Comprobante, Cuenta } from '@/types/api';

vi.mock('../hooks/use-comprobante', () => ({
  useComprobante: vi.fn(),
}));

// useCuentas como vi.fn() para poder sobreescribir el retorno en cada describe.
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(),
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

function setupDefaultMocks(cuentas: Cuenta[] = []) {
  (useComprobante as ReturnType<typeof vi.fn>).mockReturnValue({
    data: mockComprobante,
    isLoading: false,
    isError: false,
  });
  (useCuentas as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: cuentas },
  });
}

vi.mock('./contabilizar-comprobante-dialog', () => ({
  ContabilizarComprobanteDialog: () => null,
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
