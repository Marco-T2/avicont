import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConfiabilidadBanner } from './confiabilidad-banner';

describe('ConfiabilidadBanner — la confiabilidad CALIFICA, no suprime (REQ-ICB-05)', () => {
  it('conciliado afirma que la identidad cierra', () => {
    render(<ConfiabilidadBanner conciliado motivos={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent(/conciliado/i);
    expect(screen.getByText(/la identidad cierra/i)).toBeInTheDocument();
  });

  it('no conciliado retiene la conclusión y nombra cada motivo en lenguaje de contador', () => {
    render(
      <ConfiabilidadBanner
        conciliado={false}
        motivos={[
          { tipo: 'HUECO', desde: '2026-07-11', hasta: '2026-07-19' },
          { tipo: 'DESCUADRE', importacionId: 'imp-1' },
        ]}
      />,
    );

    expect(screen.getByText(/no afirma que la cuenta esté conciliada/i)).toBeInTheDocument();
    expect(
      screen.getByText(/falta extracto entre el 11\/07\/2026 y el 19\/07\/2026/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/descuadre de verificación/i)).toBeInTheDocument();
    // El enum crudo jamás llega a pantalla.
    expect(screen.queryByText('HUECO')).not.toBeInTheDocument();
    expect(screen.queryByText('DESCUADRE')).not.toBeInTheDocument();
  });
});
