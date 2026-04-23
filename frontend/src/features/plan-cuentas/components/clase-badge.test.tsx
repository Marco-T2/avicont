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

  it('aplica variables del tema distintas por cada clase', () => {
    const { container: a } = render(<ClaseBadge clase="ACTIVO" />);
    const { container: p } = render(<ClaseBadge clase="PASIVO" />);
    const activoClasses = a.firstElementChild?.className ?? '';
    const pasivoClasses = p.firstElementChild?.className ?? '';
    // Tras la migración a variables del tema (src/index.css), cada clase usa
    // clase-{activo,pasivo,...}-{fg,bg}. Validamos que existen las tokens
    // correctas y que dos clases distintas no comparten className.
    expect(activoClasses).toContain('clase-activo-fg');
    expect(activoClasses).toContain('clase-activo-bg');
    expect(pasivoClasses).toContain('clase-pasivo-fg');
    expect(pasivoClasses).toContain('clase-pasivo-bg');
    expect(activoClasses).not.toBe(pasivoClasses);
  });
});
