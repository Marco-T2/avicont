import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import type { AuditoriaVinculos, VinculoRoto } from '@/types/api';

import { AuditoriaVinculosBanner } from './auditoria-vinculos-banner';

function roto(overrides: Partial<VinculoRoto>): VinculoRoto {
  return {
    movimientoBancarioId: 'm-1',
    cuentaBancariaId: 'cb-1',
    fecha: '2026-06-10',
    monto: '1500.00',
    moneda: 'BOB',
    descripcion: 'DEPOSITO EN EFECTIVO',
    motivo: 'COMPROBANTE_ANULADO',
    ...overrides,
  };
}

function renderBanner(auditoria: AuditoriaVinculos) {
  render(
    <MemoryRouter>
      <AuditoriaVinculosBanner
        auditoria={auditoria}
        aliasPorCuenta={{ 'cb-1': 'BancoSol operativa' }}
      />
    </MemoryRouter>,
  );
}

describe('AuditoriaVinculosBanner (REQ-VMB-07)', () => {
  it('sin auditoría aplicada no renderiza nada', () => {
    renderBanner({ aplicada: false, total: 0, rotos: [] });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('auditoría aplicada sin rotos no renderiza nada (no hay qué destapar)', () => {
    renderBanner({ aplicada: true, total: 0, rotos: [] });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con rotos muestra el contador REAL y el detalle de cada vínculo con su motivo', () => {
    renderBanner({
      aplicada: true,
      total: 2,
      rotos: [
        roto({}),
        roto({
          movimientoBancarioId: 'm-2',
          motivo: 'MONTO_CAMBIADO',
          descripcion: 'TRANSFERENCIA QR',
        }),
      ],
    });

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(/2 movimientos con vínculo roto/i);
    expect(screen.getByText(/el comprobante fue anulado/i)).toBeInTheDocument();
    expect(screen.getByText(/el monto de la línea cambió/i)).toBeInTheDocument();
  });

  it('el contador usa el total real aunque la franja venga al tope de 100', () => {
    renderBanner({ aplicada: true, total: 150, rotos: [roto({})] });

    expect(screen.getByRole('alert')).toHaveTextContent(/150 movimientos con vínculo roto/i);
    expect(screen.getByText(/mostrando los primeros 1/i)).toBeInTheDocument();
  });

  it('linkea al workspace de conciliación para resolver los rotos', () => {
    renderBanner({ aplicada: true, total: 1, rotos: [roto({})] });

    const link = screen.getByRole('link', { name: /ir a conciliación/i });
    expect(link).toHaveAttribute('href', '/conciliacion');
  });
});
