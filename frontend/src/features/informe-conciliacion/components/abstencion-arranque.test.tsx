import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { InformeConciliacion } from '@/types/api';

import { AbstencionArranque } from './abstencion-arranque';

// Abstención (REQ-ICB-04): 200 con arranque/partidas/residuo null y los
// saldos PRESENTES. Es el estado normal de una cuenta recién adoptada.
const INFORME_ABSTENIDO: InformeConciliacion = {
  cuentaBancaria: {
    id: 'cb-1',
    alias: 'Cuenta corriente BancoSol',
    cuentaId: 'cuenta-1',
    moneda: 'BOB',
    numeroCuenta: '1191959-000-001',
  },
  corte: '2026-07-31',
  saldoExtracto: '12000.00',
  saldoLibros: '11000.00',
  arranque: null,
  partidas: null,
  residuo: null,
  confiabilidad: { conciliado: false, motivos: [{ tipo: 'SIN_ARRANQUE' }] },
  insumos: { importaciones: [] },
};

describe('AbstencionArranque — la abstención es visible y accionable, no un error', () => {
  it('muestra ambos saldos aunque el puente no exista todavía', () => {
    render(<AbstencionArranque informe={INFORME_ABSTENIDO} />);

    expect(screen.getByText(/saldo según extracto/i)).toBeInTheDocument();
    expect(screen.getByText('12.000,00')).toBeInTheDocument();
    expect(screen.getByText(/saldo según libros/i)).toBeInTheDocument();
    expect(screen.getByText('11.000,00')).toBeInTheDocument();
  });

  it('explica que falta declarar el punto de partida y que NO es un error', () => {
    render(<AbstencionArranque informe={INFORME_ABSTENIDO} />);

    expect(
      screen.getByText(/falta declarar el punto de arranque/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no es un error/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renderiza la acción de declarar cuando la página la provee (task 3.11)', () => {
    render(
      <AbstencionArranque
        informe={INFORME_ABSTENIDO}
        accionDeclarar={<button type="button">Declarar arranque</button>}
      />,
    );

    expect(
      screen.getByRole('button', { name: /declarar arranque/i }),
    ).toBeInTheDocument();
  });

  it('sin saldo publicado por el banco lo dice en lugar de inventar un cero', () => {
    render(
      <AbstencionArranque
        informe={{
          ...INFORME_ABSTENIDO,
          saldoExtracto: null,
          confiabilidad: {
            conciliado: false,
            motivos: [{ tipo: 'SIN_ARRANQUE' }, { tipo: 'SIN_SALDO_EXTRACTO' }],
          },
        }}
      />,
    );

    expect(screen.getByText(/sin saldo publicado/i)).toBeInTheDocument();
  });
});
