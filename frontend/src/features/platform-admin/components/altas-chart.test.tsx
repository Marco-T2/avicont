import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AltasPorMes } from '@/types/api';

import { AltasChart } from './altas-chart';

const ALTAS_SERIE: AltasPorMes[] = [
  { year: 2025, month: 7, count: 0 },
  { year: 2025, month: 8, count: 2 },
  { year: 2025, month: 9, count: 5 },
  { year: 2025, month: 10, count: 3 },
  { year: 2025, month: 11, count: 1 },
  { year: 2025, month: 12, count: 4 },
  { year: 2026, month: 1, count: 6 },
  { year: 2026, month: 2, count: 2 },
  { year: 2026, month: 3, count: 0 },
  { year: 2026, month: 4, count: 8 },
  { year: 2026, month: 5, count: 7 },
  { year: 2026, month: 6, count: 3 },
];

describe('AltasChart', () => {
  it('renderiza un elemento por mes de la serie', () => {
    render(<AltasChart altasPorMes={ALTAS_SERIE} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(12);
  });

  it('muestra las etiquetas de meses abreviadas en español', () => {
    render(<AltasChart altasPorMes={ALTAS_SERIE} />);

    expect(screen.getAllByText('Ene').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jun').length).toBeGreaterThan(0);
  });

  it('muestra el empty state cuando la serie está vacía', () => {
    render(<AltasChart altasPorMes={[]} />);

    expect(screen.getByText('Sin datos de altas.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('muestra los valores de conteo de meses con count > 0', () => {
    render(<AltasChart altasPorMes={ALTAS_SERIE} />);

    // Los meses con count > 0 muestran el número dentro de cada barra
    expect(screen.getByText('8')).toBeInTheDocument(); // máximo
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('tiene aria-label descriptivo en el contenedor', () => {
    render(<AltasChart altasPorMes={ALTAS_SERIE} />);

    expect(
      screen.getByLabelText('Gráfico de altas de organizaciones por mes'),
    ).toBeInTheDocument();
  });
});
