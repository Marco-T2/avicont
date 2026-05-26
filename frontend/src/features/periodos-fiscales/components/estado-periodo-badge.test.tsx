import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EstadoPeriodoBadge } from './estado-periodo-badge';

describe('EstadoPeriodoBadge', () => {
  it('ABIERTO sin borradores → texto "Abierto" con variant secondary', () => {
    render(<EstadoPeriodoBadge status="ABIERTO" />);
    const badge = screen.getByText('Abierto');
    expect(badge).toBeInTheDocument();
  });

  it('ABIERTO con borradores → texto "Abierto · con borradores"', () => {
    render(<EstadoPeriodoBadge status="ABIERTO" conBorradores />);
    expect(screen.getByText('Abierto · con borradores')).toBeInTheDocument();
  });

  it('ABIERTO con borradores → clases ámbar aplicadas', () => {
    const { container } = render(<EstadoPeriodoBadge status="ABIERTO" conBorradores />);
    const badge = container.firstElementChild;
    expect(badge?.className).toContain('amber');
  });

  it('CERRADO → texto "Cerrado" con clases verdes', () => {
    render(<EstadoPeriodoBadge status="CERRADO" />);
    expect(screen.getByText('Cerrado')).toBeInTheDocument();
  });

  it('CERRADO → clases verdes aplicadas', () => {
    const { container } = render(<EstadoPeriodoBadge status="CERRADO" />);
    const badge = container.firstElementChild;
    expect(badge?.className).toContain('green');
  });

  it('tiene role="status" para accesibilidad', () => {
    render(<EstadoPeriodoBadge status="ABIERTO" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('ABIERTO y CERRADO generan classNames distintos', () => {
    const { container: a } = render(<EstadoPeriodoBadge status="ABIERTO" />);
    const { container: c } = render(<EstadoPeriodoBadge status="CERRADO" />);
    expect(a.firstElementChild?.className).not.toBe(c.firstElementChild?.className);
  });
});
