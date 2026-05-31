import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BalanceGeneralResponse } from '@/types/api';

import { BalanceGeneralTabla } from './balance-general-tabla';

// ============================================================
// Fixtures
// ============================================================

const balance: BalanceGeneralResponse = {
  fechaCorte: '2026-05-31',
  gestionId: 'gestion-1',
  activo: {
    claseCuenta: 'ACTIVO',
    titulo: 'Activo',
    subsecciones: [
      {
        subClaseCuenta: 'ACTIVO_CORRIENTE',
        titulo: 'Activo Corriente',
        cuentas: [
          {
            cuentaId: 'c-1',
            codigoInterno: '1.1.1',
            nombre: 'Caja moneda nacional',
            nivel: 3,
            esContraria: false,
            esSintetica: false,
            saldoBob: '1000.00',
          },
          {
            cuentaId: 'c-2',
            codigoInterno: '1.1.9',
            nombre: 'Depreciación acumulada',
            nivel: 3,
            esContraria: true,
            esSintetica: false,
            saldoBob: '200.00',
          },
        ],
        totalBob: '800.00',
      },
    ],
    totalBob: '800.00',
  },
  pasivo: {
    claseCuenta: 'PASIVO',
    titulo: 'Pasivo',
    subsecciones: [
      {
        subClaseCuenta: 'PASIVO_CORRIENTE',
        titulo: 'Pasivo Corriente',
        cuentas: [
          {
            cuentaId: 'c-3',
            codigoInterno: '2.1.1',
            nombre: 'Proveedores por pagar',
            nivel: 3,
            esContraria: false,
            esSintetica: false,
            saldoBob: '300.00',
          },
        ],
        totalBob: '300.00',
      },
    ],
    totalBob: '300.00',
  },
  patrimonio: {
    claseCuenta: 'PATRIMONIO',
    titulo: 'Patrimonio',
    subsecciones: [
      {
        subClaseCuenta: 'CAPITAL',
        titulo: 'Capital',
        cuentas: [
          {
            cuentaId: 'c-4',
            codigoInterno: '3.1.1',
            nombre: 'Capital social',
            nivel: 3,
            esContraria: false,
            esSintetica: false,
            saldoBob: '400.00',
          },
          {
            cuentaId: null,
            codigoInterno: null,
            nombre: 'Resultado del Ejercicio (en curso)',
            nivel: 3,
            esContraria: false,
            esSintetica: true,
            saldoBob: '100.00',
          },
        ],
        totalBob: '500.00',
      },
    ],
    totalBob: '500.00',
  },
  resultadoEjercicioBob: '100.00',
  totalActivoBob: '800.00',
  totalPasivoBob: '300.00',
  totalPatrimonioBob: '500.00',
  cuadra: true,
  diferenciaBob: '0.00',
};

function renderTabla(props: Partial<Parameters<typeof BalanceGeneralTabla>[0]> = {}) {
  return render(
    <BalanceGeneralTabla data={balance} isLoading={false} isError={false} {...props} />,
  );
}

// ============================================================
// Secciones
// ============================================================

describe('BalanceGeneralTabla — secciones', () => {
  it('muestra los títulos de las tres secciones raíz', () => {
    renderTabla();
    expect(screen.getAllByText('Activo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pasivo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Patrimonio').length).toBeGreaterThanOrEqual(1);
  });

  it('muestra los títulos de las subsecciones', () => {
    renderTabla();
    expect(screen.getByText('Activo Corriente')).toBeDefined();
    expect(screen.getByText('Pasivo Corriente')).toBeDefined();
    expect(screen.getByText('Capital')).toBeDefined();
  });
});

// ============================================================
// Cuentas
// ============================================================

describe('BalanceGeneralTabla — cuentas', () => {
  it('muestra el nombre y código de cada cuenta hoja', () => {
    renderTabla();
    expect(screen.getByText('Caja moneda nacional')).toBeDefined();
    expect(screen.getByText('1.1.1')).toBeDefined();
    expect(screen.getByText('Proveedores por pagar')).toBeDefined();
  });

  it('muestra el saldo de las cuentas', () => {
    renderTabla();
    // Caja 1000.00 → "1.000,00" en formato es-BO
    expect(screen.getAllByText(/1[.,]000/).length).toBeGreaterThanOrEqual(1);
  });

  it('marca visualmente las cuentas contrarias', () => {
    renderTabla();
    expect(screen.getAllByText(/contraria/i).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Resultado del Ejercicio (línea sintética)
// ============================================================

describe('BalanceGeneralTabla — resultado del ejercicio', () => {
  it('muestra la línea sintética del Resultado del Ejercicio en el Patrimonio', () => {
    renderTabla();
    expect(screen.getByText(/resultado del ejercicio/i)).toBeDefined();
  });
});

// ============================================================
// Totales y cuadre
// ============================================================

describe('BalanceGeneralTabla — totales y cuadre', () => {
  it('muestra el total del Activo', () => {
    renderTabla();
    expect(screen.getAllByText(/800/).length).toBeGreaterThanOrEqual(1);
  });

  it('indica que el balance cuadra cuando cuadra es true', () => {
    renderTabla();
    expect(screen.getByText(/cuadra/i)).toBeDefined();
  });

  it('muestra la diferencia y marca descuadre cuando cuadra es false', () => {
    renderTabla({
      data: { ...balance, cuadra: false, diferenciaBob: '50.00' },
    });
    expect(screen.getByText(/no cuadra|descuadre/i)).toBeDefined();
    expect(screen.getAllByText(/50/).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Estados: loading, error
// ============================================================

describe('BalanceGeneralTabla — estados', () => {
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
    expect(screen.queryByText('Caja moneda nacional')).toBeNull();
  });
});
