import { NaturalezaCuenta } from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

import {
  toBalanceComprobacionResponse,
  type BalanceComprobacionResult,
} from './balance-comprobacion-response.dto';

/**
 * Tests del mapper `toBalanceComprobacionResponse`.
 *
 * Verifica serialización Money → string 2 decimales (§4.5), Date → "YYYY-MM-DD"
 * sin UTC drift (§4.6), preservación del boolean `cuadra` y el mapeo de
 * `cuentasNaturalezaOpuesta` (REQ-BC-11).
 */
describe('toBalanceComprobacionResponse', () => {
  function resultBase(): BalanceComprobacionResult {
    return {
      lineas: [
        {
          cuentaId: 'c1',
          codigoInterno: '1101',
          nombre: 'Caja MN',
          naturaleza: NaturalezaCuenta.DEUDORA,
          sumasDebito: Money.of('1000'),
          sumasCredito: Money.of('300'),
          saldoDeudor: Money.of('700'),
          saldoAcreedor: Money.ZERO,
        },
      ],
      totalSumasDebito: Money.of('1000'),
      totalSumasCredito: Money.of('300'),
      totalSaldoDeudor: Money.of('700'),
      totalSaldoAcreedor: Money.ZERO,
      cuadra: true,
      diferenciaSumas: Money.of('700'),
      diferenciaSaldos: Money.of('700'),
      cuentasNaturalezaOpuesta: [],
    };
  }

  it('serializa los Money de las líneas a string con 2 decimales (§4.5)', () => {
    const dto = toBalanceComprobacionResponse(resultBase(), {
      desde: new Date(Date.UTC(2026, 3, 1)),
      hasta: new Date(Date.UTC(2026, 3, 30)),
    });

    const linea = dto.lineas[0]!;
    expect(linea.sumasDebito).toBe('1000.00');
    expect(linea.sumasCredito).toBe('300.00');
    expect(linea.saldoDeudor).toBe('700.00');
    expect(linea.saldoAcreedor).toBe('0.00');
    expect(typeof linea.sumasDebito).toBe('string');
  });

  it('serializa los totales y diferencias a string con 2 decimales', () => {
    const dto = toBalanceComprobacionResponse(resultBase(), {
      desde: new Date(Date.UTC(2026, 3, 1)),
      hasta: new Date(Date.UTC(2026, 3, 30)),
    });

    expect(dto.totalSumasDebito).toBe('1000.00');
    expect(dto.totalSumasCredito).toBe('300.00');
    expect(dto.totalSaldoDeudor).toBe('700.00');
    expect(dto.totalSaldoAcreedor).toBe('0.00');
    expect(dto.diferenciaSumas).toBe('700.00');
    expect(dto.diferenciaSaldos).toBe('700.00');
  });

  it('formatea las fechas como "YYYY-MM-DD" sin UTC drift (§4.6)', () => {
    const dto = toBalanceComprobacionResponse(resultBase(), {
      desde: new Date(Date.UTC(2026, 3, 1)),
      hasta: new Date(Date.UTC(2026, 3, 30)),
    });

    expect(dto.fechaDesde).toBe('2026-04-01');
    expect(dto.fechaHasta).toBe('2026-04-30');
  });

  it('preserva el boolean cuadra sin convertirlo a string', () => {
    const dto = toBalanceComprobacionResponse(resultBase(), {
      desde: new Date(Date.UTC(2026, 3, 1)),
      hasta: new Date(Date.UTC(2026, 3, 30)),
    });

    expect(dto.cuadra).toBe(true);
    expect(typeof dto.cuadra).toBe('boolean');
  });

  it('mapea cuentasNaturalezaOpuesta con saldoOpuesto string (REQ-BC-11)', () => {
    const result = resultBase();
    result.cuentasNaturalezaOpuesta = [
      {
        cuentaId: 'c2',
        codigoInterno: '1102',
        nombre: 'Banco',
        naturaleza: NaturalezaCuenta.DEUDORA,
        saldoOpuesto: Money.of('150'),
      },
    ];

    const dto = toBalanceComprobacionResponse(result, {
      desde: new Date(Date.UTC(2026, 3, 1)),
      hasta: new Date(Date.UTC(2026, 3, 30)),
    });

    expect(dto.cuentasNaturalezaOpuesta).toHaveLength(1);
    const opuesta = dto.cuentasNaturalezaOpuesta[0]!;
    expect(opuesta.cuentaId).toBe('c2');
    expect(opuesta.naturaleza).toBe('DEUDORA');
    expect(opuesta.saldoOpuesto).toBe('150.00');
    expect(typeof opuesta.saldoOpuesto).toBe('string');
  });
});
