import { describe, expect, it } from 'vitest';

import { declararArranqueSchema } from './declarar-arranque-schema';

const VALIDO = {
  fecha: '2026-06-30',
  saldoExtracto: '1000.00',
  saldoLibros: '990.00',
  diferenciaResidual: '10.00',
  nota: 'Adopción del sistema',
};

describe('declararArranqueSchema — los CUATRO datos los declara el usuario', () => {
  it('acepta una declaración completa', () => {
    expect(declararArranqueSchema.safeParse(VALIDO).success).toBe(true);
  });

  it('acepta una diferencia residual NEGATIVA (extracto por debajo de los libros)', () => {
    expect(
      declararArranqueSchema.safeParse({ ...VALIDO, diferenciaResidual: '-25.50' }).success,
    ).toBe(true);
  });

  it('acepta la nota vacía u omitida', () => {
    const sinNota = {
      fecha: VALIDO.fecha,
      saldoExtracto: VALIDO.saldoExtracto,
      saldoLibros: VALIDO.saldoLibros,
      diferenciaResidual: VALIDO.diferenciaResidual,
    };
    expect(declararArranqueSchema.safeParse(sinNota).success).toBe(true);
    expect(declararArranqueSchema.safeParse({ ...VALIDO, nota: '' }).success).toBe(true);
  });

  it('rechaza una fecha que no sea calendario puro YYYY-MM-DD', () => {
    expect(declararArranqueSchema.safeParse({ ...VALIDO, fecha: '30/06/2026' }).success).toBe(
      false,
    );
  });

  it('rechaza un saldo no numérico', () => {
    expect(
      declararArranqueSchema.safeParse({ ...VALIDO, saldoExtracto: 'mil' }).success,
    ).toBe(false);
  });

  it('rechaza una diferencia residual vacía — es una DECLARACIÓN, no un default', () => {
    expect(
      declararArranqueSchema.safeParse({ ...VALIDO, diferenciaResidual: '' }).success,
    ).toBe(false);
  });

  it('rechaza separador de miles o coma decimal (§4.5: punto decimal, sin miles)', () => {
    expect(
      declararArranqueSchema.safeParse({ ...VALIDO, saldoLibros: '1.000,00' }).success,
    ).toBe(false);
  });
});
