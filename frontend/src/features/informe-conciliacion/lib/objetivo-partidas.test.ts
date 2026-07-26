import { describe, expect, it } from 'vitest';

import {
  aCentavos,
  deCentavos,
  objetivoDePartidas,
  sumaSeleccionada,
} from './objetivo-partidas';

describe('aCentavos — sin pasar por float (§4.5)', () => {
  it('convierte montos con cero, uno y dos decimales', () => {
    expect(aCentavos('1000')).toBe(100000);
    expect(aCentavos('1000.5')).toBe(100050);
    expect(aCentavos('1000.50')).toBe(100050);
  });

  it('preserva el signo', () => {
    expect(aCentavos('-400.00')).toBe(-40000);
    expect(aCentavos('-0.01')).toBe(-1);
  });

  it('el caso que justifica no usar Number: 0.1 + 0.2', () => {
    // En float esto daría 0.30000000000000004 y la verificación del sheet
    // diría que no cierra cuando sí cierra.
    expect(aCentavos('0.10')! + aCentavos('0.20')!).toBe(aCentavos('0.30'));
  });

  it('rechaza lo que no es un decimal de hasta 2 posiciones', () => {
    expect(aCentavos('mil')).toBeNull();
    expect(aCentavos('1000.123')).toBeNull();
    expect(aCentavos('1.000,00')).toBeNull();
    expect(aCentavos('')).toBeNull();
  });
});

describe('deCentavos', () => {
  it('vuelve al string decimal con dos posiciones', () => {
    expect(deCentavos(100050)).toBe('1000.50');
    expect(deCentavos(-40000)).toBe('-400.00');
    expect(deCentavos(-1)).toBe('-0.01');
    expect(deCentavos(0)).toBe('0.00');
  });
});

describe('objetivoDePartidas — saldoLibros − saldoExtracto + residual', () => {
  it('el caso del cheque en circulación: 600 − 1000 + 0 = −400', () => {
    expect(objetivoDePartidas('600.00', '1000.00', '0.00')).toBe(-40000);
  });

  it('la residual declarada entra en la cuenta', () => {
    expect(objetivoDePartidas('990.00', '1000.00', '10.00')).toBe(0);
  });

  it('con un monto a medio escribir no afirma nada', () => {
    expect(objetivoDePartidas('600.00', '', '0.00')).toBeNull();
    expect(objetivoDePartidas('600.00', '1000.00', '-')).toBeNull();
  });
});

describe('sumaSeleccionada', () => {
  const CANDIDATOS = [
    { referencia: 'LIN:cheque:1', importe: '-400.00' },
    { referencia: 'LIN:apertura:1', importe: '1000.00' },
  ];

  it('suma solo lo confirmado', () => {
    expect(sumaSeleccionada(CANDIDATOS, new Set(['LIN:cheque:1']))).toBe(-40000);
  });

  it('confirmar la apertura además del cheque rompe la cuenta — que es el aviso', () => {
    expect(sumaSeleccionada(CANDIDATOS, new Set(['LIN:cheque:1', 'LIN:apertura:1']))).toBe(60000);
  });

  it('sin nada confirmado suma cero', () => {
    expect(sumaSeleccionada(CANDIDATOS, new Set())).toBe(0);
  });
});
