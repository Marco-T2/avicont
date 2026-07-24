import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MovimientoConciliacion } from '@/types/api';

import { EstadoMovimientoBadge } from './estado-movimiento-badge';

function movimiento(overrides: Partial<MovimientoConciliacion> = {}): MovimientoConciliacion {
  return {
    id: 'mov-1',
    fecha: '2026-06-10',
    hora: null,
    monto: '1500.00',
    tipo: 'CREDITO',
    moneda: 'BOB',
    descripcion: 'Depósito en efectivo',
    referencia: null,
    saldo: null,
    estado: 'PENDIENTE',
    estadoEfectivo: 'PENDIENTE',
    vinculo: null,
    ...overrides,
  };
}

describe('EstadoMovimientoBadge — REQ-CB-10/11: se muestra estadoEfectivo, NUNCA la columna', () => {
  it('vínculo válido → muestra "Conciliado"', () => {
    render(
      <EstadoMovimientoBadge
        movimiento={movimiento({
          estado: 'CONCILIADO',
          estadoEfectivo: 'CONCILIADO',
          vinculo: { matchId: 'match-1', comprobanteId: 'comp-1', orden: 2, roto: null },
        })}
      />,
    );

    expect(screen.getByText('Conciliado')).toBeInTheDocument();
    expect(screen.queryByText(/vínculo roto/i)).not.toBeInTheDocument();
  });

  it('columna CONCILIADO pero vínculo ROTO → muestra "Pendiente", NUNCA "Conciliado"', () => {
    render(
      <EstadoMovimientoBadge
        movimiento={movimiento({
          // La columna persistida sigue diciendo CONCILIADO...
          estado: 'CONCILIADO',
          // ...pero el estado derivado devolvió el movimiento al pool.
          estadoEfectivo: 'PENDIENTE',
          vinculo: {
            matchId: 'match-1',
            comprobanteId: 'comp-1',
            orden: 3,
            roto: 'MONTO_CAMBIADO',
          },
        })}
      />,
    );

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.queryByText('Conciliado')).not.toBeInTheDocument();
  });

  it('vínculo roto → muestra el motivo legible en español (no se traga el motivo)', () => {
    render(
      <EstadoMovimientoBadge
        movimiento={movimiento({
          estado: 'CONCILIADO',
          estadoEfectivo: 'PENDIENTE',
          vinculo: {
            matchId: 'match-1',
            comprobanteId: 'comp-1',
            orden: 3,
            roto: 'MONTO_CAMBIADO',
          },
        })}
      />,
    );

    expect(screen.getByText('Vínculo roto')).toBeInTheDocument();
    expect(screen.getByText('El monto de la línea cambió')).toBeInTheDocument();
  });

  it('otro motivo de ruptura muestra SU texto, no uno genérico', () => {
    render(
      <EstadoMovimientoBadge
        movimiento={movimiento({
          estado: 'CONCILIADO',
          estadoEfectivo: 'PENDIENTE',
          vinculo: {
            matchId: 'match-1',
            comprobanteId: 'comp-1',
            orden: 1,
            roto: 'COMPROBANTE_ANULADO',
          },
        })}
      />,
    );

    expect(screen.getByText('El comprobante fue anulado')).toBeInTheDocument();
    expect(screen.queryByText('El monto de la línea cambió')).not.toBeInTheDocument();
  });

  it('movimiento ignorado → muestra "Ignorado"', () => {
    render(
      <EstadoMovimientoBadge
        movimiento={movimiento({ estado: 'IGNORADO', estadoEfectivo: 'IGNORADO' })}
      />,
    );

    expect(screen.getByText('Ignorado')).toBeInTheDocument();
  });

  it('movimiento pendiente sin match → "Pendiente" sin marca de vínculo roto', () => {
    render(<EstadoMovimientoBadge movimiento={movimiento()} />);

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.queryByText('Vínculo roto')).not.toBeInTheDocument();
  });
});
