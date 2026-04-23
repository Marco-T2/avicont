import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClaseBadge } from './clase-badge';

describe('ClaseBadge', () => {
  it.each([
    ['ACTIVO', 'Activo'],
    ['PASIVO', 'Pasivo'],
    ['PATRIMONIO', 'Patrimonio'],
    ['INGRESO', 'Ingreso'],
    ['EGRESO', 'Egreso'],
  ] as const)('renderiza el label "%s" → "%s"', (clase, label) => {
    render(<ClaseBadge clase={clase} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('aplica color semántico distinto por cada clase', () => {
    const { container: a } = render(<ClaseBadge clase="ACTIVO" />);
    const { container: p } = render(<ClaseBadge clase="PASIVO" />);
    const activoClasses = a.firstElementChild?.className ?? '';
    const pasivoClasses = p.firstElementChild?.className ?? '';
    expect(activoClasses).toContain('blue');
    expect(pasivoClasses).toContain('red');
    expect(activoClasses).not.toBe(pasivoClasses);
  });
});
