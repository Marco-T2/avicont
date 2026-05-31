import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EstadoResultadosResponse } from '@/types/api';

import { EstadoResultadosTabla } from './estado-resultados-tabla';

// ============================================================
// Fixtures
// ============================================================

const resultados: EstadoResultadosResponse = {
  fechaDesde: '2026-05-01',
  fechaHasta: '2026-05-31',
  ingreso: {
    claseCuenta: 'INGRESO',
    titulo: 'Ingresos',
    subsecciones: [
      {
        subClaseCuenta: 'INGRESO_OPERATIVO',
        titulo: 'Ingresos Operativos',
        cuentas: [
          {
            cuentaId: 'c-1',
            codigoInterno: '4.1.1',
            nombre: 'Venta de huevos',
            nivel: 3,
            esContraria: false,
            saldoBob: '1000.00',
          },
          {
            cuentaId: 'c-2',
            codigoInterno: '4.1.9',
            nombre: 'Descuentos sobre ventas',
            nivel: 3,
            esContraria: true,
            saldoBob: '100.00',
          },
        ],
        totalBob: '900.00',
      },
    ],
    totalBob: '900.00',
  },
  egreso: {
    claseCuenta: 'EGRESO',
    titulo: 'Egresos',
    subsecciones: [
      {
        subClaseCuenta: 'EGRESO_OPERATIVO',
        titulo: 'Egresos Operativos',
        cuentas: [
          {
            cuentaId: 'c-3',
            codigoInterno: '5.1.1',
            nombre: 'Compra de alimento balanceado',
            nivel: 3,
            esContraria: false,
            saldoBob: '500.00',
          },
        ],
        totalBob: '500.00',
      },
    ],
    totalBob: '500.00',
  },
  resultadoEjercicioBob: '400.00',
  totalIngresoBob: '900.00',
  totalEgresoBob: '500.00',
  esGanancia: true,
};

function renderTabla(props: Partial<Parameters<typeof EstadoResultadosTabla>[0]> = {}) {
  return render(
    <EstadoResultadosTabla data={resultados} isLoading={false} isError={false} {...props} />,
  );
}

// ============================================================
// Secciones
// ============================================================

describe('EstadoResultadosTabla — secciones', () => {
  it('muestra los títulos de las dos secciones raíz (Ingresos y Egresos)', () => {
    renderTabla();
    expect(screen.getAllByText('Ingresos').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Egresos').length).toBeGreaterThanOrEqual(1);
  });

  it('muestra los títulos de las subsecciones', () => {
    renderTabla();
    expect(screen.getByText('Ingresos Operativos')).toBeDefined();
    expect(screen.getByText('Egresos Operativos')).toBeDefined();
  });
});

// ============================================================
// Cuentas
// ============================================================

describe('EstadoResultadosTabla — cuentas', () => {
  it('muestra el nombre y código de cada cuenta hoja', () => {
    renderTabla();
    expect(screen.getByText('Venta de huevos')).toBeDefined();
    expect(screen.getByText('4.1.1')).toBeDefined();
    expect(screen.getByText('Compra de alimento balanceado')).toBeDefined();
  });

  it('muestra el saldo de las cuentas', () => {
    renderTabla();
    // Venta 1000.00 → "1.000,00" en formato es-BO
    expect(screen.getAllByText(/1[.,]000/).length).toBeGreaterThanOrEqual(1);
  });

  it('marca visualmente las cuentas contrarias', () => {
    renderTabla();
    expect(screen.getAllByText(/contraria/i).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Resultado del Ejercicio
// ============================================================

describe('EstadoResultadosTabla — resultado del ejercicio', () => {
  it('muestra los totales de Ingresos y Egresos', () => {
    renderTabla();
    expect(screen.getByText(/total ingresos/i)).toBeDefined();
    expect(screen.getByText(/total egresos/i)).toBeDefined();
  });

  it('indica Ganancia cuando esGanancia es true', () => {
    renderTabla();
    expect(screen.getByText(/ganancia/i)).toBeDefined();
    expect(screen.getAllByText(/400/).length).toBeGreaterThanOrEqual(1);
  });

  it('indica Pérdida cuando esGanancia es false', () => {
    renderTabla({
      data: {
        ...resultados,
        resultadoEjercicioBob: '-300.00',
        totalIngresoBob: '200.00',
        totalEgresoBob: '500.00',
        esGanancia: false,
      },
    });
    expect(screen.getByText(/p[ée]rdida/i)).toBeDefined();
    expect(screen.getAllByText(/300/).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Estados: loading, error
// ============================================================

describe('EstadoResultadosTabla — estados', () => {
  it('muestra skeletons cuando isLoading es true', () => {
    const { container } = renderTabla({ isLoading: true, data: undefined });
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('muestra banner de error cuando isError es true', () => {
    renderTabla({ isError: true, data: undefined });
    expect(screen.getByText(/no se pud/i)).toBeDefined();
  });

  it('NO muestra las secciones cuando hay error', () => {
    renderTabla({ isError: true, data: undefined });
    expect(screen.queryByText('Venta de huevos')).toBeNull();
  });
});
