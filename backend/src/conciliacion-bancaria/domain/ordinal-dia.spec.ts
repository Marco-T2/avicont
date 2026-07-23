import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { MovimientoParseado } from '../ports/extracto-parser.port';
import { ordenarCanonico } from './orden-canonico';
import { asignarOrdinalDia } from './ordinal-dia';

function mov(partial: {
  fecha: string;
  monto: string;
  tipo: 'DEBITO' | 'CREDITO';
  descripcion: string;
  referencia?: string | null;
}): MovimientoParseado {
  return {
    fecha: FechaContable.fromIso(partial.fecha),
    hora: null,
    monto: Money.of(partial.monto),
    tipo: partial.tipo,
    descripcion: partial.descripcion,
    referencia: partial.referencia ?? null,
    saldo: null,
    contraparteNombre: null,
    contraparteDocumento: null,
    datosOriginales: {},
  };
}

describe('asignarOrdinalDia (REQ-CB-07, design §6.3)', () => {
  it('dos movimientos idénticos el mismo día → ordinalDia 0 y 1, ninguno se descarta', () => {
    const comisionA = mov({
      fecha: '2026-06-03',
      monto: '3.00',
      tipo: 'DEBITO',
      descripcion: 'COMISION ITF',
    });
    const comisionB = mov({
      fecha: '2026-06-03',
      monto: '3.00',
      tipo: 'DEBITO',
      descripcion: 'COMISION ITF',
    });

    const resultado = asignarOrdinalDia(ordenarCanonico([comisionA, comisionB]));

    expect(resultado).toHaveLength(2);
    expect(resultado.map((r) => r.ordinalDia).sort()).toEqual([0, 1]);
  });

  it('movimiento único en su grupo de tupla → ordinalDia 0', () => {
    const unico = mov({
      fecha: '2026-06-03',
      monto: '350.00',
      tipo: 'CREDITO',
      descripcion: 'TRANSFERENCIA',
    });
    const resultado = asignarOrdinalDia(ordenarCanonico([unico]));
    expect(resultado[0]?.ordinalDia).toBe(0);
  });

  it('tres movimientos idénticos el mismo día → ordinales 0, 1, 2', () => {
    const triple = [0, 1, 2].map(() =>
      mov({ fecha: '2026-06-03', monto: '10.00', tipo: 'DEBITO', descripcion: 'CARGO' }),
    );
    const resultado = asignarOrdinalDia(ordenarCanonico(triple));
    expect(resultado.map((r) => r.ordinalDia).sort()).toEqual([0, 1, 2]);
  });

  it('agrupa por TUPLA (fecha, monto, tipo, descripcionNormalizada), no por día completo', () => {
    // Mismo día, dos grupos de tupla distintos (montos distintos) — cada uno
    // debe contar independientemente, empezando en 0.
    const grupoA1 = mov({
      fecha: '2026-06-03',
      monto: '100.00',
      tipo: 'DEBITO',
      descripcion: 'PAGO A',
    });
    const grupoA2 = mov({
      fecha: '2026-06-03',
      monto: '100.00',
      tipo: 'DEBITO',
      descripcion: 'PAGO A',
    });
    const grupoB1 = mov({
      fecha: '2026-06-03',
      monto: '200.00',
      tipo: 'CREDITO',
      descripcion: 'PAGO B',
    });

    const resultado = asignarOrdinalDia(ordenarCanonico([grupoA1, grupoA2, grupoB1]));

    const ordinalesGrupoA = resultado
      .filter((r) => r.movimiento.descripcion === 'PAGO A')
      .map((r) => r.ordinalDia)
      .sort();
    const ordinalesGrupoB = resultado
      .filter((r) => r.movimiento.descripcion === 'PAGO B')
      .map((r) => r.ordinalDia);

    expect(ordinalesGrupoA).toEqual([0, 1]);
    expect(ordinalesGrupoB).toEqual([0]); // NO 2 — un import parcial de A no debe correr el ordinal de B
  });

  it('distinto tipo (DEBITO vs CREDITO) es un grupo de tupla DISTINTO aunque monto/fecha/descripción coincidan', () => {
    const debito = mov({
      fecha: '2026-06-03',
      monto: '50.00',
      tipo: 'DEBITO',
      descripcion: 'AJUSTE',
    });
    const credito = mov({
      fecha: '2026-06-03',
      monto: '50.00',
      tipo: 'CREDITO',
      descripcion: 'AJUSTE',
    });
    const resultado = asignarOrdinalDia(ordenarCanonico([debito, credito]));
    expect(resultado.map((r) => r.ordinalDia)).toEqual([0, 0]);
  });

  it('grupo recompuesto en distinto orden de entrada (pre-ordenarCanonico) da los mismos ordinales', () => {
    const a = mov({
      fecha: '2026-06-03',
      monto: '3.00',
      tipo: 'DEBITO',
      descripcion: 'COMISION ITF',
      referencia: 'R1',
    });
    const b = mov({
      fecha: '2026-06-03',
      monto: '3.00',
      tipo: 'DEBITO',
      descripcion: 'COMISION ITF',
      referencia: 'R2',
    });
    const c = mov({ fecha: '2026-06-05', monto: '999.99', tipo: 'CREDITO', descripcion: 'OTRO' });

    const ordenA = asignarOrdinalDia(ordenarCanonico([a, b, c]));
    const ordenB = asignarOrdinalDia(ordenarCanonico([c, b, a])); // mismo conjunto, orden de entrada invertido

    const claveOrdinal = (r: { movimiento: MovimientoParseado; ordinalDia: number }) =>
      `${r.movimiento.referencia ?? 'sinref'}:${r.ordinalDia}`;

    expect(new Set(ordenA.map(claveOrdinal))).toEqual(new Set(ordenB.map(claveOrdinal)));
  });

  it('no muta el array de entrada', () => {
    const entrada = ordenarCanonico([
      mov({ fecha: '2026-06-03', monto: '3.00', tipo: 'DEBITO', descripcion: 'COMISION ITF' }),
    ]);
    const copia = [...entrada];
    asignarOrdinalDia(entrada);
    expect(entrada).toEqual(copia);
  });

  it('lista vacía devuelve lista vacía', () => {
    expect(asignarOrdinalDia([])).toEqual([]);
  });
});
