import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EstadoCuentaResumen } from './estado-cuenta-resumen';

interface Overrides {
  razonSocial?: string;
  fechaCorte?: string;
  totalSaldoPendiente?: string;
  saldoAFavor?: string;
}

function renderResumen(overrides: Overrides = {}) {
  return render(
    <EstadoCuentaResumen
      razonSocial={overrides.razonSocial ?? 'Avícola Sur S.R.L.'}
      fechaCorte={overrides.fechaCorte ?? '2026-07-28'}
      totalSaldoPendiente={overrides.totalSaldoPendiente ?? '900.00'}
      saldoAFavor={overrides.saldoAFavor ?? '300.00'}
    />,
  );
}

describe('EstadoCuentaResumen', () => {
  it('muestra la razón social y la fecha de corte del backend, formateada sin corrimiento UTC', () => {
    // fechaCorte primer día del mes: un `new Date(iso)` parseado como UTC
    // renderizaría 30/06/2026 en America/La_Paz. Caza el mutante de §4.6.
    renderResumen({ fechaCorte: '2026-07-01' });
    expect(screen.getByText('Avícola Sur S.R.L.')).toBeInTheDocument();
    expect(screen.getByText(/Saldos al/)).toBeInTheDocument();
    expect(screen.getByText('01/07/2026')).toBeInTheDocument();
    expect(screen.queryByText('30/06/2026')).not.toBeInTheDocument();
  });

  it('renderiza los totales del backend tal cual (§4.5, sin recalcular)', () => {
    renderResumen({ totalSaldoPendiente: '900.10', saldoAFavor: '300.99' });
    expect(screen.getByText('900,10')).toBeInTheDocument();
    expect(screen.getByText('300,99')).toBeInTheDocument();
  });

  it('el saldo a favor en cero NO se esconde: mostrar cero es información', () => {
    renderResumen({ saldoAFavor: '0.00' });
    expect(screen.getByText(/Saldo a favor del cliente/i)).toBeInTheDocument();
    expect(screen.getByText('0,00')).toBeInTheDocument();
    expect(
      screen.getByText(/todavía no imputados a ninguna venta/i),
    ).toBeInTheDocument();
  });
});
