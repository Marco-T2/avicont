import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EvolucionPatrimonioResponse } from '@/types/api';

import { EvolucionPatrimonioTabla } from './evolucion-patrimonio-tabla';

function crearResponse(
  overrides?: Partial<EvolucionPatrimonioResponse>,
): EvolucionPatrimonioResponse {
  return {
    fechaDesde: '2026-01-01',
    fechaHasta: '2026-12-31',
    componentes: [
      {
        cuentaId: 'cap',
        codigoInterno: '3.1.1.001',
        nombre: 'Capital Social',
        esContraria: false,
        esSintetica: false,
        saldoInicialBob: '0.00',
        resultadoEjercicioBob: '0.00',
        otrosMovimientosBob: '100000.00',
        saldoFinalBob: '100000.00',
        cuadra: true,
        diferenciaBob: '0.00',
      },
      {
        cuentaId: null,
        codigoInterno: null,
        nombre: 'Resultado del Ejercicio (en curso)',
        esContraria: false,
        esSintetica: true,
        saldoInicialBob: '0.00',
        resultadoEjercicioBob: '30000.00',
        otrosMovimientosBob: '0.00',
        saldoFinalBob: '30000.00',
        cuadra: true,
        diferenciaBob: '0.00',
      },
    ],
    totales: {
      saldoInicialBob: '0.00',
      resultadoEjercicioBob: '30000.00',
      otrosMovimientosBob: '100000.00',
      saldoFinalBob: '130000.00',
    },
    cuadra: true,
    diferenciaBob: '0.00',
    ...overrides,
  };
}

describe('EvolucionPatrimonioTabla', () => {
  it('renderiza los componentes y la columna sintética del resultado', () => {
    render(
      <EvolucionPatrimonioTabla data={crearResponse()} isLoading={false} isError={false} />,
    );

    expect(screen.getByText('Capital Social')).toBeInTheDocument();
    expect(screen.getByText('Resultado del Ejercicio (en curso)')).toBeInTheDocument();
    expect(screen.getByText('La evolución cuadra')).toBeInTheDocument();
  });

  it('muestra el descuadre cuando cuadra=false', () => {
    render(
      <EvolucionPatrimonioTabla
        data={crearResponse({ cuadra: false, diferenciaBob: '5.00' })}
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.getByText(/No cuadra/)).toBeInTheDocument();
  });

  it('muestra empty state cuando no hay componentes', () => {
    render(
      <EvolucionPatrimonioTabla
        data={crearResponse({ componentes: [], totales: {
          saldoInicialBob: '0.00',
          resultadoEjercicioBob: '0.00',
          otrosMovimientosBob: '0.00',
          saldoFinalBob: '0.00',
        } })}
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.getByText(/No hay movimientos de patrimonio/)).toBeInTheDocument();
  });

  it('muestra mensaje de error', () => {
    render(<EvolucionPatrimonioTabla data={undefined} isLoading={false} isError={true} />);
    expect(screen.getByText(/No se pudo cargar la Evolución del Patrimonio/)).toBeInTheDocument();
  });
});
