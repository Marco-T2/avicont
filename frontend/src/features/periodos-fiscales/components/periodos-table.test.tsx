import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Periodo } from '@/types/api';

import { PeriodosTable } from './periodos-table';

function makePeriodo(overrides: Partial<Periodo> & { id: string; month: number }): Periodo {
  return {
    gestionId: 'g1',
    year: 2026,
    ordenEnGestion: overrides.month ?? 1,
    status: 'ABIERTO',
    esDefinitivo: false,
    closedAt: null,
    closedByUserId: null,
    fechaInicio: `2026-0${overrides.month ?? 1}-01`,
    fechaFin: `2026-0${overrides.month ?? 1}-28`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const PERIODOS_12: Periodo[] = Array.from({ length: 12 }, (_, i) =>
  makePeriodo({ id: `p${i + 1}`, month: i + 1, ordenEnGestion: i + 1 }),
);

const PERIODO_CERRADO = makePeriodo({
  id: 'pc1',
  month: 1,
  status: 'CERRADO',
  closedAt: '2026-02-01T00:00:00Z',
  closedByUserId: 'u1',
});

describe('PeriodosTable', () => {
  it('renderiza 12 filas para los 12 períodos', () => {
    render(<PeriodosTable periodos={PERIODOS_12} onRowClick={vi.fn()} />);
    // Debe haber 12 botones de fila (uno por período)
    const rows = screen.getAllByRole('row');
    // +1 por el header row
    expect(rows.length).toBe(13);
  });

  it('click en una fila llama onRowClick con el período correcto', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<PeriodosTable periodos={PERIODOS_12} onRowClick={onRowClick} />);
    // Clickear la primera fila de datos
    const dataRows = screen.getAllByRole('row').slice(1);
    await user.click(dataRows[0]);
    expect(onRowClick).toHaveBeenCalledWith(PERIODOS_12[0]);
  });

  it('período CERRADO muestra badge "Cerrado"', () => {
    render(<PeriodosTable periodos={[PERIODO_CERRADO]} onRowClick={vi.fn()} />);
    // Desktop + mobile renderizan ambos en JSDOM (sin media queries), por eso getAllByText.
    const badges = screen.getAllByText('Cerrado');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('período ABIERTO muestra badge "Abierto"', () => {
    render(<PeriodosTable periodos={PERIODOS_12.slice(0, 1)} onRowClick={vi.fn()} />);
    const badges = screen.getAllByText('Abierto');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renderiza sin reventar con lista vacía', () => {
    const { container } = render(<PeriodosTable periodos={[]} onRowClick={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('smoke test: renderiza sin errores con periodos mixtos (mobile breakpoint)', () => {
    // Vitest no hace resize de viewport, pero validamos que el componente
    // renderice sin throw — la estrategia mobile (card stack) se verifica
    // manualmente en el checklist §7 del CLAUDE.md.
    const mixed = [
      makePeriodo({ id: 'm1', month: 1, status: 'CERRADO', closedAt: '2026-02-01T00:00:00Z', closedByUserId: 'u1' }),
      makePeriodo({ id: 'm2', month: 2, status: 'ABIERTO' }),
    ];
    const { container } = render(<PeriodosTable periodos={mixed} onRowClick={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
