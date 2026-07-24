import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { MovimientoParseado } from '../ports/extracto-parser.port';
import { calcularHashDedup } from './hash-dedup';
import type { MovimientoConOrdinalDia } from './ordinal-dia';

function itemConOrdinal(
  partial: {
    fecha: string;
    monto: string;
    tipo: 'DEBITO' | 'CREDITO';
    descripcion: string;
  },
  ordinalDia: number,
): MovimientoConOrdinalDia {
  const movimiento: MovimientoParseado = {
    fecha: FechaContable.fromIso(partial.fecha),
    hora: null,
    monto: Money.of(partial.monto),
    tipo: partial.tipo,
    descripcion: partial.descripcion,
    referencia: null,
    saldo: null,
    contraparteNombre: null,
    contraparteDocumento: null,
    datosOriginales: {},
  };
  return { movimiento, ordinalDia };
}

describe('calcularHashDedup (REQ-CB-07, design §6.1)', () => {
  it('hash golden — pin exacto del algoritmo (sha256 con separador Unit Separator + prefijo v1)', () => {
    const item = itemConOrdinal(
      { fecha: '2026-06-03', monto: '12600.00', tipo: 'DEBITO', descripcion: 'PAGO PROVEEDOR' },
      0,
    );
    const hash = calcularHashDedup('cb-001', item);
    // Golden value calculado independientemente:
    // sha256('v1' + US + 'cb-001' + US + '2026-06-03' + US + '12600.00' + US
    //        + 'DEBITO' + US + 'PAGO PROVEEDOR' + US + '0')
    expect(hash).toBe('674549c9bc7427c53b65f0f3d67f25169af0fa002fad99f0cb6d3d2621b5f357');
  });

  it('devuelve un digest sha256 hex de 64 caracteres', () => {
    const item = itemConOrdinal(
      { fecha: '2026-06-03', monto: '100.00', tipo: 'CREDITO', descripcion: 'X' },
      0,
    );
    const hash = calcularHashDedup('cb-001', item);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es determinístico: mismo input produce siempre el mismo hash', () => {
    const item = itemConOrdinal(
      { fecha: '2026-06-03', monto: '100.00', tipo: 'DEBITO', descripcion: 'REPETIBLE' },
      1,
    );
    expect(calcularHashDedup('cb-001', item)).toBe(calcularHashDedup('cb-001', item));
  });

  it('distinta cuentaBancariaId → hash distinto', () => {
    const item = itemConOrdinal(
      { fecha: '2026-06-03', monto: '100.00', tipo: 'DEBITO', descripcion: 'X' },
      0,
    );
    expect(calcularHashDedup('cb-001', item)).not.toBe(calcularHashDedup('cb-002', item));
  });

  it('distinto ordinalDia → hash distinto (esto es lo que permite que 2 movimientos idénticos sobrevivan ambos)', () => {
    const base = {
      fecha: '2026-06-03',
      monto: '3.00',
      tipo: 'DEBITO' as const,
      descripcion: 'COMISION ITF',
    };
    const hashOrdinal0 = calcularHashDedup('cb-001', itemConOrdinal(base, 0));
    const hashOrdinal1 = calcularHashDedup('cb-001', itemConOrdinal(base, 1));
    expect(hashOrdinal0).not.toBe(hashOrdinal1);
  });

  it('montoCentavos usa money.toBob() (string 2-dec), NUNCA number: dos Money construidos distinto pero con igual toBob() dan el mismo hash', () => {
    const base = { fecha: '2026-06-03', tipo: 'DEBITO' as const, descripcion: 'X' };
    const item1 = itemConOrdinal({ ...base, monto: '100' }, 0);
    const item2 = itemConOrdinal({ ...base, monto: '100.00' }, 0);
    expect(item1.movimiento.monto.toBob()).toBe(item2.movimiento.monto.toBob());
    expect(calcularHashDedup('cb-001', item1)).toBe(calcularHashDedup('cb-001', item2));
  });

  it('distinto monto → hash distinto', () => {
    const base = { fecha: '2026-06-03', tipo: 'DEBITO' as const, descripcion: 'X' };
    const item1 = itemConOrdinal({ ...base, monto: '100.00' }, 0);
    const item2 = itemConOrdinal({ ...base, monto: '100.01' }, 0);
    expect(calcularHashDedup('cb-001', item1)).not.toBe(calcularHashDedup('cb-001', item2));
  });

  it('distinto tipo (DEBITO vs CREDITO) → hash distinto', () => {
    const base = { fecha: '2026-06-03', monto: '100.00', descripcion: 'X' };
    const item1 = itemConOrdinal({ ...base, tipo: 'DEBITO' }, 0);
    const item2 = itemConOrdinal({ ...base, tipo: 'CREDITO' }, 0);
    expect(calcularHashDedup('cb-001', item1)).not.toBe(calcularHashDedup('cb-001', item2));
  });

  it('descripción se normaliza antes de hashear: DEPÓSITO y DEPOSITO dan el mismo hash', () => {
    const base = { fecha: '2026-06-03', monto: '100.00', tipo: 'DEBITO' as const };
    const item1 = itemConOrdinal({ ...base, descripcion: 'DEPÓSITO' }, 0);
    const item2 = itemConOrdinal({ ...base, descripcion: 'DEPOSITO' }, 0);
    expect(calcularHashDedup('cb-001', item1)).toBe(calcularHashDedup('cb-001', item2));
  });

  it('separador Unit Separator evita colisión en el límite descripcionNormalizada/ordinalDia (análogo a (AB,C) vs (A,BC))', () => {
    const base = { fecha: '2026-06-03', monto: '100.00', tipo: 'DEBITO' as const };
    // Sin separador: 'PAGO1' + '0' === 'PAGO' + '10' === 'PAGO10'.
    const conDescripcionLarga = itemConOrdinal({ ...base, descripcion: 'PAGO1' }, 0);
    const conOrdinalLargo = itemConOrdinal({ ...base, descripcion: 'PAGO' }, 10);
    expect(calcularHashDedup('cb-001', conDescripcionLarga)).not.toBe(
      calcularHashDedup('cb-001', conOrdinalLargo),
    );
  });
});
