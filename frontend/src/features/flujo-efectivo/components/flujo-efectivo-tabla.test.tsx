import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import { FlujoEfectivoTabla } from './flujo-efectivo-tabla';

function crearLinea(
  overrides?: Partial<EstadoFlujoEfectivoResponse['operacion']['lineas'][number]>,
): EstadoFlujoEfectivoResponse['operacion']['lineas'][number] {
  return {
    cuentaId: 'cuenta-1',
    codigoInterno: '4.1.1.001',
    nombre: 'Utilidad del ejercicio',
    tipo: 'RESULTADO_EJERCICIO',
    monto: '30000.00',
    ...overrides,
  };
}

function crearResponse(
  overrides?: Partial<EstadoFlujoEfectivoResponse>,
): EstadoFlujoEfectivoResponse {
  return {
    fechaDesde: '2026-01-01',
    fechaHasta: '2026-12-31',
    resultadoEjercicio: '30000.00',
    operacion: {
      lineas: [
        crearLinea({ tipo: 'RESULTADO_EJERCICIO', nombre: 'Utilidad del ejercicio', monto: '30000.00' }),
        crearLinea({ tipo: 'PARTIDA_NO_MONETARIA', nombre: 'Depreciación acumulada', monto: '5000.00', cuentaId: 'dep-1', codigoInterno: '1.2.2.001' }),
      ],
      subtotal: '35000.00',
    },
    inversion: {
      lineas: [
        crearLinea({ tipo: 'VARIACION_CUENTA', nombre: 'Compra de maquinaria', monto: '-20000.00', cuentaId: 'maq-1', codigoInterno: '1.2.1.001' }),
      ],
      subtotal: '-20000.00',
    },
    financiacion: {
      lineas: [
        crearLinea({ tipo: 'VARIACION_CUENTA', nombre: 'Préstamo bancario', monto: '10000.00', cuentaId: 'prest-1', codigoInterno: '2.1.1.001' }),
      ],
      subtotal: '10000.00',
    },
    efectivoInicial: '5000.00',
    variacionNeta: '25000.00',
    efectivoFinal: '30000.00',
    cuadra: true,
    diferencia: '0.00',
    advertencias: [],
    cuentasEfectivoDetectadasPorHeuristica: [],
    ...overrides,
  };
}

describe('FlujoEfectivoTabla', () => {
  it('muestra skeleton durante la carga', () => {
    const { container } = render(
      <FlujoEfectivoTabla data={undefined} isLoading={true} isError={false} />,
    );
    // El skeleton renderiza elementos div con clase animate-pulse
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('muestra banner de error inline cuando la query falla (Anti-F-13)', () => {
    render(<FlujoEfectivoTabla data={undefined} isLoading={false} isError={true} />);
    expect(screen.getByText(/No se pudo cargar el Flujo de Efectivo/)).toBeInTheDocument();
  });

  it('muestra estado vacío cuando ninguna actividad tiene líneas', () => {
    render(
      <FlujoEfectivoTabla
        data={crearResponse({
          operacion: { lineas: [], subtotal: '0.00' },
          inversion: { lineas: [], subtotal: '0.00' },
          financiacion: { lineas: [], subtotal: '0.00' },
        })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByText(/No hay movimientos/)).toBeInTheDocument();
  });

  it('renderiza las 3 secciones con sus subtotales', () => {
    render(
      <FlujoEfectivoTabla data={crearResponse()} isLoading={false} isError={false} />,
    );
    // Encabezados de sección
    expect(screen.getByText(/Actividades de Operación/i)).toBeInTheDocument();
    expect(screen.getByText(/Actividades de Inversión/i)).toBeInTheDocument();
    expect(screen.getByText(/Actividades de Financiación/i)).toBeInTheDocument();

    // Líneas de cada sección
    expect(screen.getByText('Utilidad del ejercicio')).toBeInTheDocument();
    expect(screen.getByText('Depreciación acumulada')).toBeInTheDocument();
    expect(screen.getByText('Compra de maquinaria')).toBeInTheDocument();
    expect(screen.getByText('Préstamo bancario')).toBeInTheDocument();
  });

  it('muestra el resultado del ejercicio como punto de partida', () => {
    render(
      <FlujoEfectivoTabla data={crearResponse()} isLoading={false} isError={false} />,
    );
    // "Resultado del ejercicio" debe aparecer al menos una vez (punto de partida + posible badge)
    const elementos = screen.getAllByText(/Resultado del ejercicio/i);
    expect(elementos.length).toBeGreaterThan(0);
  });

  it('muestra indicador de cuadre verde cuando cuadra === true', () => {
    render(
      <FlujoEfectivoTabla
        data={crearResponse({ cuadra: true })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByText(/El flujo cuadra/i)).toBeInTheDocument();
  });

  it('muestra indicador de descuadre con diferencia cuando cuadra === false', () => {
    render(
      <FlujoEfectivoTabla
        data={crearResponse({ cuadra: false, diferencia: '5.00' })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByText(/No cuadra/i)).toBeInTheDocument();
    // §4.5: la diferencia se muestra formateada es-BO ('5.00' → '5,00'), no recalculada.
    expect(screen.getByText('5,00')).toBeInTheDocument();
  });

  it('muestra advertencias cuando existen', () => {
    render(
      <FlujoEfectivoTabla
        data={crearResponse({ advertencias: ['No se identificó ninguna cuenta de efectivo'] })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(
      screen.getByText('No se identificó ninguna cuenta de efectivo'),
    ).toBeInTheDocument();
  });

  it('muestra cuentas detectadas por heurística cuando existen', () => {
    render(
      <FlujoEfectivoTabla
        data={crearResponse({
          cuentasEfectivoDetectadasPorHeuristica: [
            { cuentaId: 'c1', codigoInterno: '1.1.1.001', nombre: 'Caja' },
          ],
        })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByText(/Caja/)).toBeInTheDocument();
    expect(screen.getByText(/heurística/i)).toBeInTheDocument();
  });

  it('no muestra bloque de señales de calidad cuando ambos arrays están vacíos', () => {
    render(
      <FlujoEfectivoTabla
        data={crearResponse({ advertencias: [], cuentasEfectivoDetectadasPorHeuristica: [] })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.queryByText(/heurística/i)).toBeNull();
  });

  it('el tipo de cada línea se muestra en español, no como literal del enum', () => {
    render(
      <FlujoEfectivoTabla
        data={crearResponse()}
        isLoading={false}
        isError={false}
      />,
    );
    // "PARTIDA_NO_MONETARIA" debe mostrarse como "Partida no monetaria"
    expect(screen.getByText('Partida no monetaria')).toBeInTheDocument();
    // El literal crudo NO debe aparecer
    expect(screen.queryByText('PARTIDA_NO_MONETARIA')).toBeNull();
  });
});
