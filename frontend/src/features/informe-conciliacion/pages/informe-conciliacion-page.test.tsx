import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InformeConciliacionPage } from './informe-conciliacion-page';

describe('InformeConciliacionPage (task 3.9 — contenedor de la ruta)', () => {
  it('renderiza el header canónico de la página', () => {
    render(<InformeConciliacionPage />);
    expect(
      screen.getByRole('heading', { name: 'Informe de conciliación' }),
    ).toBeInTheDocument();
  });

  it('sin cuenta ni corte elegidos muestra el empty state que guía la emisión', () => {
    render(<InformeConciliacionPage />);
    expect(
      screen.getByText(/elegí una cuenta bancaria y una fecha de corte/i),
    ).toBeInTheDocument();
  });
});
