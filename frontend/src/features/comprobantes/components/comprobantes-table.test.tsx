import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ComprobanteListItem } from '@/types/api';

import { ComprobantesTable } from './comprobantes-table';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockComprobantes: ComprobanteListItem[] = [
  {
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
  },
  {
    id: 'comp-2',
    tipo: 'EGRESO',
    numero: null,
    estado: 'BORRADOR',
    fechaContable: '2026-05-01',
    periodoFiscalId: 'p1',
    glosa: 'Compra de materiales',
    monedaPrincipal: 'BOB',
    tipoCambioReexpresion: '1.00000000',
    totalDebitoBob: '500.00',
    totalCreditoBob: '500.00',
    anulado: false,
    fechaAnulacion: null,
    anuladoPorUserId: null,
    motivoAnulacion: null,
    createdByUserId: 'u1',
    createdAt: '2026-05-01T08:00:00Z',
    updatedAt: '2026-05-01T08:00:00Z',
  },
];

function renderTable(
  props: Partial<Parameters<typeof ComprobantesTable>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <ComprobantesTable
        comprobantes={mockComprobantes}
        isLoading={false}
        isError={false}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ComprobantesTable', () => {
  it('renderiza las glosas de los comprobantes', () => {
    renderTable();
    // getAllByText por desktop+mobile en JSDOM
    expect(screen.getAllByText('Pago de servicios de limpieza').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Compra de materiales').length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza el número correlativo en font-mono', () => {
    renderTable();
    // El prefijo y la secuencia están separados — buscar solo el prefijo
    expect(screen.getAllByText('D2604').length).toBeGreaterThanOrEqual(1);
  });

  it('navega al detalle al hacer clic en una fila', async () => {
    const user = userEvent.setup();
    renderTable();
    // Click en el botón "Ver" del primer comprobante
    const verBtns = screen.getAllByRole('button', { name: 'Ver' });
    const firstVer = verBtns[0];
    if (firstVer !== undefined) {
      await user.click(firstVer);
      expect(mockNavigate).toHaveBeenCalledWith('/comprobantes/comp-1');
    }
  });

  it('muestra empty state cuando no hay comprobantes', () => {
    renderTable({ comprobantes: [] });
    expect(
      screen.getByText(/No hay comprobantes para mostrar/i),
    ).toBeInTheDocument();
  });

  it('muestra error state cuando isError=true', () => {
    renderTable({ isError: true, comprobantes: undefined });
    expect(
      screen.getByText(/No se pudieron cargar los comprobantes/i),
    ).toBeInTheDocument();
  });

  it('muestra badge de anulado cuando anulado=true', () => {
    const anulado: ComprobanteListItem = {
      ...mockComprobantes[0]!,
      anulado: true,
      fechaAnulacion: '2026-05-10T00:00:00Z',
    };
    renderTable({ comprobantes: [anulado] });
    // getAllByText por desktop+mobile dup en JSDOM
    expect(screen.getAllByText('Anulado').length).toBeGreaterThanOrEqual(1);
  });

  it('MontoCell usa moneda BOB hardcodeada — no muestra "$" en el total', () => {
    // El total totalDebitoBob SIEMPRE es BOB aunque monedaPrincipal pudiera ser otro valor.
    // El componente debe hardcodear moneda="BOB" y nunca pasar c.monedaPrincipal al MontoCell.
    renderTable();
    // "Bs" debe estar presente (prefijo BOB)
    expect(screen.getAllByText('Bs').length).toBeGreaterThanOrEqual(1);
    // "$" no debe aparecer en los MontoCell del total (solo se usaría si se pasara USD)
    const dolarSigns = screen.queryAllByText('$');
    expect(dolarSigns).toHaveLength(0);
  });
});
