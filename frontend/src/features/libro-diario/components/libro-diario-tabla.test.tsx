import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AsientoLibroDiario } from '@/types/api';

import { LibroDiarioTabla } from './libro-diario-tabla';

// Fixtures de asientos de prueba
const asientoContabilizado: AsientoLibroDiario = {
  id: 'comp-1',
  fechaContable: '2026-05-01',
  numero: 'D2605-000001',
  tipo: 'DIARIO',
  estado: 'CONTABILIZADO',
  glosa: 'Pago proveedor materiales',
  anulado: false,
  totalDebeBob: '0.00',
  totalHaberBob: '0.00',
  lineas: [
    {
      codigoCuenta: '4.1.1',
      nombreCuenta: 'Gastos de materiales',
      glosa: null,
      debeBob: '1000.00',
      haberBob: '0.00',
    },
    {
      codigoCuenta: '1.1.1',
      nombreCuenta: 'Caja moneda nacional',
      glosa: 'Salida de caja',
      debeBob: '0.00',
      haberBob: '1000.00',
    },
  ],
};

const asientoAnulado: AsientoLibroDiario = {
  id: 'comp-2',
  fechaContable: '2026-05-15',
  numero: 'D2605-000002',
  tipo: 'EGRESO',
  estado: 'CONTABILIZADO',
  glosa: 'Compra anulada',
  anulado: true,
  totalDebeBob: '0.00',
  totalHaberBob: '0.00',
  lineas: [
    {
      codigoCuenta: '4.1.2',
      nombreCuenta: 'Servicios varios',
      glosa: null,
      debeBob: '500.00',
      haberBob: '0.00',
    },
    {
      codigoCuenta: '1.1.2',
      nombreCuenta: 'Banco BNB',
      glosa: null,
      debeBob: '0.00',
      haberBob: '500.00',
    },
  ],
};

const asientoBloqueado: AsientoLibroDiario = {
  id: 'comp-3',
  fechaContable: '2026-05-20',
  numero: 'D2605-000003',
  tipo: 'DIARIO',
  estado: 'BLOQUEADO',
  glosa: 'Cierre del período',
  anulado: false,
  totalDebeBob: '0.00',
  totalHaberBob: '0.00',
  lineas: [
    {
      codigoCuenta: '3.1.1',
      nombreCuenta: 'Resultado del ejercicio',
      glosa: null,
      debeBob: '250.00',
      haberBob: '0.00',
    },
    {
      codigoCuenta: '4.1.1',
      nombreCuenta: 'Gastos de materiales',
      glosa: null,
      debeBob: '0.00',
      haberBob: '250.00',
    },
  ],
};

// ============================================================
// Helpers
// ============================================================

function renderTabla(props: Partial<Parameters<typeof LibroDiarioTabla>[0]> = {}) {
  return render(
    <LibroDiarioTabla
      asientos={[asientoContabilizado, asientoBloqueado]}
      totalDebeBob="1250.00"
      totalHaberBob="1250.00"
      isLoading={false}
      isError={false}
      {...props}
    />,
  );
}

// ============================================================
// Tests: agrupación por asiento
// ============================================================

describe('LibroDiarioTabla — agrupación', () => {
  it('muestra la glosa del asiento en la fila cabecera', () => {
    renderTabla();
    // Puede aparecer en desktop o mobile — getAllByText
    const matches = screen.getAllByText('Pago proveedor materiales');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el número correlativo del asiento', () => {
    renderTabla();
    const matches = screen.getAllByText('D2605-000001');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra la fecha formateada dd/mm/yyyy', () => {
    renderTabla();
    // 2026-05-01 → "01/05/2026" en América/La_Paz
    const matches = screen.getAllByText('01/05/2026');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el código de cuenta de cada línea', () => {
    renderTabla();
    const codes = screen.getAllByText('4.1.1');
    expect(codes.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el nombre de cuenta de cada línea', () => {
    renderTabla();
    const nombres = screen.getAllByText('Gastos de materiales');
    expect(nombres.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra el monto debe de una línea', () => {
    renderTabla();
    // 1000.00 formateado — puede ser "1.000,00" o "1,000.00" según locale
    // pero el texto está en el DOM de alguna forma
    const montos = screen.getAllByText(/1[.,]000/);
    expect(montos.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra la glosa de línea cuando no es null', () => {
    renderTabla();
    const matches = screen.getAllByText('Salida de caja');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza múltiples asientos', () => {
    renderTabla();
    const glosasContabilizado = screen.getAllByText('Pago proveedor materiales');
    const glosasBlockeado = screen.getAllByText('Cierre del período');
    expect(glosasContabilizado.length).toBeGreaterThanOrEqual(1);
    expect(glosasBlockeado.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Tests: total al pie
// ============================================================

describe('LibroDiarioTabla — totales', () => {
  it('muestra los totales al pie de la tabla', () => {
    renderTabla({ totalDebeBob: '1250.00', totalHaberBob: '1250.00' });
    // Los totales deben estar visibles — buscar texto de total
    const totales = screen.getAllByText(/1[.,]250/);
    expect(totales.length).toBeGreaterThanOrEqual(2); // debe + haber
  });

  it('muestra totalDebeBob y totalHaberBob correctamente', () => {
    renderTabla({ totalDebeBob: '500.00', totalHaberBob: '500.00' });
    const totales = screen.getAllByText(/500/);
    expect(totales.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// Tests: estado vacío
// ============================================================

describe('LibroDiarioTabla — estado vacío', () => {
  it('muestra mensaje cuando no hay asientos', () => {
    renderTabla({
      asientos: [],
      totalDebeBob: '0.00',
      totalHaberBob: '0.00',
    });
    expect(
      screen.getByText(/no hay asientos|sin movimientos|no se encontraron/i),
    ).toBeDefined();
  });
});

// ============================================================
// Tests: estado de error
// ============================================================

describe('LibroDiarioTabla — estado de error', () => {
  it('muestra mensaje de error cuando isError es true', () => {
    renderTabla({ isError: true });
    expect(
      screen.getByText(/no se pudi?e?ron? cargar|error/i),
    ).toBeDefined();
  });

  it('NO muestra la tabla de asientos cuando hay error', () => {
    renderTabla({ isError: true, asientos: [asientoContabilizado] });
    // El mensaje de error aparece; la glosa del asiento NO
    expect(screen.queryByText('Pago proveedor materiales')).toBeNull();
  });
});

// ============================================================
// Tests: estado de carga
// ============================================================

describe('LibroDiarioTabla — loading', () => {
  it('muestra skeletons de carga cuando isLoading es true', () => {
    const { container } = renderTabla({ isLoading: true });
    // Buscar elementos con clase skeleton
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Tests: asientos anulados
// ============================================================

describe('LibroDiarioTabla — anulados', () => {
  it('marca visualmente el asiento anulado', () => {
    renderTabla({
      asientos: [asientoAnulado],
      totalDebeBob: '0.00',
      totalHaberBob: '0.00',
    });
    // Buscar indicador de anulado — texto o badge
    const anulados = screen.getAllByText(/anulado/i);
    expect(anulados.length).toBeGreaterThanOrEqual(1);
  });
});
