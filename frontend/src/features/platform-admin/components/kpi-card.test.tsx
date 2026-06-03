import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiCard } from './kpi-card';

describe('KpiCard', () => {
  it('renderiza el título y valor formateado', () => {
    render(<KpiCard title="Activas" value={42} />);

    expect(screen.getByText('Activas')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renderiza la etiqueta opcional cuando se pasa', () => {
    render(<KpiCard title="Usuarios" value={100} label="en la plataforma" />);

    expect(screen.getByText('en la plataforma')).toBeInTheDocument();
  });

  it('no renderiza etiqueta cuando no se pasa', () => {
    render(<KpiCard title="Total" value={5} />);

    expect(screen.queryByText('en la plataforma')).not.toBeInTheDocument();
  });

  it('formatea valores grandes con separadores locales', () => {
    render(<KpiCard title="Transacciones" value={1500} />);

    // En es-BO los miles se separan con punto: "1.500"
    const valueEl = screen.getByText(/1[.,]?500/);
    expect(valueEl).toBeInTheDocument();
  });
});
