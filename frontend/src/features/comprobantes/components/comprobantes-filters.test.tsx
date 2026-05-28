import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ComprobantesFilters } from './comprobantes-filters';

function renderFilters(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <ComprobantesFilters />
    </MemoryRouter>,
  );
}

describe('ComprobantesFilters (smoke)', () => {
  it('renderiza los filtros de tipo, estado y toggle de anulados', () => {
    renderFilters();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
    expect(screen.getByLabelText('Mostrar anulados')).toBeInTheDocument();
  });

  it('el toggle de anulados arranca en off por default', () => {
    renderFilters();
    const toggle = screen.getByRole('switch', { name: 'Mostrar anulados' });
    expect(toggle).not.toBeChecked();
  });
});
