import { EstadoComprobante, TipoComprobante } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import type { ComprobanteLibroDiarioRow } from '../ports/comprobantes-reader.port';
import { toLibroDiarioResponse } from './libro-diario-response.dto';

// ============================================================
// Fixtures
// ============================================================

function makeLinea(
  orden: number,
  codigo: string,
  nombre: string,
  debitoBob: number,
  creditoBob: number,
  glosaLinea: string | null = null,
) {
  return {
    orden,
    glosaLinea,
    debitoBob: new Decimal(debitoBob),
    creditoBob: new Decimal(creditoBob),
    cuenta: { codigoInterno: codigo, nombre },
  };
}

function makeAsiento(
  overrides: Partial<ComprobanteLibroDiarioRow> = {},
): ComprobanteLibroDiarioRow {
  return {
    id: 'comp-uuid-1',
    organizationId: 'org-1',
    tipo: TipoComprobante.DIARIO,
    numero: 'D2601-000001',
    estado: EstadoComprobante.CONTABILIZADO,
    fechaContable: new Date('2026-01-15T00:00:00Z'),
    glosa: 'Venta de mercadería',
    anulado: false,
    lineas: [
      makeLinea(1, '1.1.1.001', 'Caja MN', 1000, 0),
      makeLinea(2, '4.1.1.001', 'Ventas', 0, 1000),
    ],
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('toLibroDiarioResponse (unit)', () => {
  const rango = {
    desde: new Date('2026-01-01T00:00:00Z'),
    hasta: new Date('2026-01-31T00:00:00Z'),
  };

  it('mapea un asiento CONTABILIZADO con dos líneas correctamente', () => {
    const rows = [makeAsiento()];
    const result = toLibroDiarioResponse(rows, rango);

    expect(result.asientos).toHaveLength(1);
    const asiento = result.asientos[0];
    expect(asiento).toBeDefined();
    expect(asiento!.id).toBe('comp-uuid-1');
    expect(asiento!.numero).toBe('D2601-000001');
    expect(asiento!.glosa).toBe('Venta de mercadería');
    expect(asiento!.estado).toBe('CONTABILIZADO');
    expect(asiento!.anulado).toBe(false);
    expect(asiento!.fechaContable).toBe('2026-01-15'); // YYYY-MM-DD puro
  });

  it('convierte Decimal a string con 2 decimales (§4.5 CLAUDE.md)', () => {
    const rows = [makeAsiento()];
    const result = toLibroDiarioResponse(rows, rango);

    const linea1 = result.asientos[0]!.lineas[0];
    expect(linea1).toBeDefined();
    expect(linea1!.debeBob).toBe('1000.00');
    expect(linea1!.haberBob).toBe('0.00');

    const linea2 = result.asientos[0]!.lineas[1];
    expect(linea2!.debeBob).toBe('0.00');
    expect(linea2!.haberBob).toBe('1000.00');
  });

  it('mapea codigoCuenta y nombreCuenta de la línea', () => {
    const rows = [makeAsiento()];
    const result = toLibroDiarioResponse(rows, rango);

    const linea1 = result.asientos[0]!.lineas[0]!;
    expect(linea1.codigoCuenta).toBe('1.1.1.001');
    expect(linea1.nombreCuenta).toBe('Caja MN');
    expect(linea1.glosa).toBeNull();
  });

  it('incluye glosa de línea cuando existe', () => {
    const rows = [makeAsiento({
      lineas: [makeLinea(1, '1.1.1.001', 'Caja', 500, 0, 'Cobro cliente XYZ')],
    })];
    const result = toLibroDiarioResponse(rows, rango);

    expect(result.asientos[0]!.lineas[0]!.glosa).toBe('Cobro cliente XYZ');
  });

  it('calcula totalDebeBob y totalHaberBob como suma de todas las líneas', () => {
    const rows = [
      makeAsiento({ lineas: [makeLinea(1, '1.1', 'Caja', 1000, 0), makeLinea(2, '4.1', 'Ventas', 0, 1000)] }),
      makeAsiento({
        id: 'comp-uuid-2',
        numero: 'D2601-000002',
        lineas: [makeLinea(1, '1.1', 'Caja', 500, 0), makeLinea(2, '4.1', 'Ventas', 0, 500)],
      }),
    ];
    const result = toLibroDiarioResponse(rows, rango);

    // 1000 + 500 = 1500 debe
    expect(result.totalDebeBob).toBe('1500.00');
    expect(result.totalHaberBob).toBe('1500.00');
  });

  it('devuelve totalDebeBob y totalHaberBob "0.00" cuando no hay asientos', () => {
    const result = toLibroDiarioResponse([], rango);

    expect(result.asientos).toHaveLength(0);
    expect(result.totalDebeBob).toBe('0.00');
    expect(result.totalHaberBob).toBe('0.00');
  });

  it('mapea el rango a strings YYYY-MM-DD en el response', () => {
    const result = toLibroDiarioResponse([], rango);

    expect(result.rango.fechaDesde).toBe('2026-01-01');
    expect(result.rango.fechaHasta).toBe('2026-01-31');
  });

  it('marca anulado=true en asientos anulados', () => {
    const rows = [makeAsiento({ anulado: true })];
    const result = toLibroDiarioResponse(rows, rango);

    expect(result.asientos[0]!.anulado).toBe(true);
  });

  it('maneja Decimal con decimales fraccionarios correctamente', () => {
    const rows = [
      makeAsiento({
        lineas: [
          makeLinea(1, '1.1', 'Cuenta', 1250.75, 0),
          makeLinea(2, '4.1', 'Otra', 0, 1250.75),
        ],
      }),
    ];
    const result = toLibroDiarioResponse(rows, rango);

    expect(result.totalDebeBob).toBe('1250.75');
    expect(result.totalHaberBob).toBe('1250.75');
    expect(result.asientos[0]!.lineas[0]!.debeBob).toBe('1250.75');
  });
});
