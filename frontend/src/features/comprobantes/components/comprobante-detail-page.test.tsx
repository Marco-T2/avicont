import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Comprobante } from '@/types/api';

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
      cuentaId: 'cuenta-caja',
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

vi.mock('../hooks/use-comprobante', () => ({
  useComprobante: () => ({
    data: mockComprobante,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: () => ({ data: { items: [] } }),
}));

vi.mock('./editar-comprobante-sheet', () => ({
  EditarComprobanteSheet: () => null,
}));
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
    renderPage();
    // getAllByText porque aparece en cabecera + glosa field
    expect(
      screen.getAllByText('Pago de servicios de limpieza').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renderiza el badge de estado', () => {
    renderPage();
    expect(screen.getAllByText('Contabilizado').length).toBeGreaterThanOrEqual(1);
  });

  it('botón "Volver a comprobantes" presente', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /comprobantes/i })).toBeInTheDocument();
  });

  it('muestra la línea del comprobante', () => {
    renderPage();
    expect(screen.getByText('Cobro de servicios')).toBeInTheDocument();
  });
});
