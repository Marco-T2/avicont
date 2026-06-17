import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Comprobante } from '@/types/api';

// Mock cross-feature hooks
vi.mock('@/features/comprobantes/hooks/use-comprobante', () => ({
  useComprobante: vi.fn(),
}));

vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
}));

vi.mock('@/features/contactos/hooks/use-contactos', () => ({
  useContactos: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
}));

import { useComprobante } from '@/features/comprobantes/hooks/use-comprobante';
import { AsientoCierreCard } from './asiento-cierre-card';

const mockUseComprobante = useComprobante as ReturnType<typeof vi.fn>;

const baseComprobante: Comprobante = {
  id: 'comp-1',
  tipo: 'CIERRE',
  numero: null,
  estado: 'BORRADOR',
  fechaContable: '2026-12-31',
  periodoFiscalId: 'periodo-1',
  glosa: 'Cierre de cuentas de gastos',
  monedaPrincipal: 'BOB',
  tipoCambioReexpresion: '1',
  totalDebitoBob: '60000.00',
  totalCreditoBob: '60000.00',
  anulado: false,
  fechaAnulacion: null,
  anuladoPorUserId: null,
  motivoAnulacion: null,
  createdByUserId: 'user-1',
  createdAt: '2026-12-31T00:00:00Z',
  updatedAt: '2026-12-31T00:00:00Z',
  lineas: [
    {
      id: 'linea-1',
      orden: 1,
      cuentaId: 'cuenta-1',
      contactoId: null,
      moneda: 'BOB',
      debito: '60000.00',
      credito: '0.00',
      tipoCambio: '1',
      debitoBob: '60000.00',
      creditoBob: '0.00',
      glosaLinea: 'Gastos del ejercicio',
    },
  ],
};

const cierre = {
  id: 'comp-1',
  origenTipo: 'CIERRE_GASTOS',
  estado: 'BORRADOR' as const,
};

describe('AsientoCierreCard', () => {
  it('muestra el label del origenTipo y la glosa en la cabecera', () => {
    mockUseComprobante.mockReturnValue({ data: baseComprobante, isLoading: false, isError: false });

    render(<AsientoCierreCard cierre={cierre} />);

    expect(screen.getByText('Cierre de gastos y costos')).toBeInTheDocument();
    expect(screen.getByText('Cierre de cuentas de gastos')).toBeInTheDocument();
  });

  it('muestra skeleton cuando useComprobante está cargando', () => {
    mockUseComprobante.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(<AsientoCierreCard cierre={cierre} />);

    // El skeleton no es la tabla — no debería haber tabla
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra el monto de debe (string sin recalcular) — §4.5 monto string preservado', () => {
    mockUseComprobante.mockReturnValue({ data: baseComprobante, isLoading: false, isError: false });

    render(<AsientoCierreCard cierre={cierre} />);

    // El monto se renderiza como string via MontoCell sin parseFloat.
    // Puede aparecer varias veces (cabecera + tabla) — usamos getAllByText.
    const montoCells = screen.getAllByText('60000.00');
    expect(montoCells.length).toBeGreaterThan(0);
  });

  it('formatea la fecha 2026-12-31 como 31/12/2026 sin desplazamiento UTC', () => {
    mockUseComprobante.mockReturnValue({ data: baseComprobante, isLoading: false, isError: false });

    render(<AsientoCierreCard cierre={cierre} />);

    expect(screen.getByText('31/12/2026')).toBeInTheDocument();
  });

  it('muestra banner inline (no toast) cuando useComprobante da error', () => {
    mockUseComprobante.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<AsientoCierreCard cierre={cierre} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
