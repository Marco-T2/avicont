import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import { detectarDiscontinuidades, type ImportacionConSaldos } from './continuidad-extractos';

function imp(partial: {
  desde: string;
  hasta: string;
  saldoInicial?: string | null;
  saldoFinal?: string | null;
  id?: string;
}): ImportacionConSaldos {
  return {
    id: partial.id ?? `imp-${partial.desde}`,
    desde: FechaContable.fromIso(partial.desde),
    hasta: FechaContable.fromIso(partial.hasta),
    saldoInicial: partial.saldoInicial == null ? null : Money.of(partial.saldoInicial),
    saldoFinal: partial.saldoFinal == null ? null : Money.of(partial.saldoFinal),
  };
}

describe('detectarDiscontinuidades (REQ-CB-23)', () => {
  it('extractos contiguos que empalman → sin discontinuidades', () => {
    const resultado = detectarDiscontinuidades([
      imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: '500' }),
      imp({ desde: '2026-07-01', hasta: '2026-07-31', saldoInicial: '500', saldoFinal: '900' }),
    ]);
    expect(resultado).toEqual([]);
  });

  it('el saldo final no empalma con el inicial del siguiente → discontinuidad con la diferencia', () => {
    const resultado = detectarDiscontinuidades([
      imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: '500' }),
      imp({ desde: '2026-07-01', hasta: '2026-07-31', saldoInicial: '450', saldoFinal: '900' }),
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.saldoFinalAnterior.toBob()).toBe('500.00');
    expect(resultado[0]?.saldoInicialSiguiente.toBob()).toBe('450.00');
    expect(resultado[0]?.diferencia.toBob()).toBe('50.00');
  });

  it('ordena por fecha antes de comparar — el orden de entrada no importa', () => {
    const julio = imp({
      desde: '2026-07-01',
      hasta: '2026-07-31',
      saldoInicial: '450',
      saldoFinal: '900',
      id: 'julio',
    });
    const junio = imp({
      desde: '2026-06-01',
      hasta: '2026-06-30',
      saldoInicial: '100',
      saldoFinal: '500',
      id: 'junio',
    });
    const resultado = detectarDiscontinuidades([julio, junio]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.anteriorId).toBe('junio');
    expect(resultado[0]?.siguienteId).toBe('julio');
  });

  it('diferencia dentro de la tolerancia de redondeo (0.01) → sin discontinuidad', () => {
    const resultado = detectarDiscontinuidades([
      imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: '500.00' }),
      imp({ desde: '2026-07-01', hasta: '2026-07-31', saldoInicial: '500.01', saldoFinal: '900' }),
    ]);
    expect(resultado).toEqual([]);
  });

  // Sin dato no hay veredicto: es la misma regla que `SIN_VERIFICAR`.
  it('saldoFinal nulo → sin veredicto, no se reporta discontinuidad', () => {
    const resultado = detectarDiscontinuidades([
      imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: null }),
      imp({ desde: '2026-07-01', hasta: '2026-07-31', saldoInicial: '450', saldoFinal: '900' }),
    ]);
    expect(resultado).toEqual([]);
  });

  it('saldoInicial del siguiente nulo → sin veredicto', () => {
    const resultado = detectarDiscontinuidades([
      imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: '500' }),
      imp({ desde: '2026-07-01', hasta: '2026-07-31', saldoInicial: null, saldoFinal: '900' }),
    ]);
    expect(resultado).toEqual([]);
  });

  // Un HUECO explica por sí solo que los saldos no empalmen: en el medio pasaron
  // movimientos que ningún extracto trajo. Reportar discontinuidad ahí sería un
  // falso positivo — el hallazgo real es el hueco, y de eso se ocupa
  // `detectarHuecos` (REQ-CB-09).
  it('hueco de calendario entre ambos → NO se compara, lo reporta detectarHuecos', () => {
    const resultado = detectarDiscontinuidades([
      imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: '500' }),
      imp({ desde: '2026-08-01', hasta: '2026-08-31', saldoInicial: '999', saldoFinal: '900' }),
    ]);
    expect(resultado).toEqual([]);
  });

  // Con solapamiento los dos saldos describen momentos distintos de la misma
  // serie: compararlos no significa nada.
  it('rangos solapados → NO se comparan', () => {
    const resultado = detectarDiscontinuidades([
      imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: '500' }),
      imp({ desde: '2026-06-15', hasta: '2026-07-15', saldoInicial: '300', saldoFinal: '900' }),
    ]);
    expect(resultado).toEqual([]);
  });

  it('tres extractos contiguos con la discontinuidad en el segundo par', () => {
    const resultado = detectarDiscontinuidades([
      imp({
        desde: '2026-06-01',
        hasta: '2026-06-30',
        saldoInicial: '100',
        saldoFinal: '500',
        id: 'junio',
      }),
      imp({
        desde: '2026-07-01',
        hasta: '2026-07-31',
        saldoInicial: '500',
        saldoFinal: '900',
        id: 'julio',
      }),
      imp({
        desde: '2026-08-01',
        hasta: '2026-08-31',
        saldoInicial: '850',
        saldoFinal: '1000',
        id: 'agosto',
      }),
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.anteriorId).toBe('julio');
    expect(resultado[0]?.siguienteId).toBe('agosto');
    expect(resultado[0]?.diferencia.toBob()).toBe('50.00');
  });

  it('lista vacía o de un solo extracto → sin discontinuidades', () => {
    expect(detectarDiscontinuidades([])).toEqual([]);
    expect(
      detectarDiscontinuidades([
        imp({ desde: '2026-06-01', hasta: '2026-06-30', saldoInicial: '100', saldoFinal: '500' }),
      ]),
    ).toEqual([]);
  });
});
