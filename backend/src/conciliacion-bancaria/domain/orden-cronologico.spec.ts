import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { MovimientoParseado } from '../ports/extracto-parser.port';
import { detectarDireccionFisica, ordenarCronologico } from './orden-cronologico';

function mov(iso: string, monto: string): MovimientoParseado {
  const [y, m, d] = iso.split('-').map(Number);
  return {
    fecha: FechaContable.of(y!, m!, d!),
    hora: null,
    monto: Money.of(monto),
    tipo: 'CREDITO',
    descripcion: `mov ${monto}`,
    referencia: null,
    saldo: null,
    contraparteNombre: null,
    contraparteDocumento: null,
    datosOriginales: {},
  };
}

describe('detectarDireccionFisica', () => {
  it('detecta ASC cuando las fechas no decrecen', () => {
    expect(detectarDireccionFisica([mov('2026-06-01', '1'), mov('2026-06-05', '2')])).toBe('ASC');
  });

  it('detecta DESC cuando las fechas no crecen', () => {
    expect(detectarDireccionFisica([mov('2026-06-05', '1'), mov('2026-06-01', '2')])).toBe('DESC');
  });

  it('un archivo de un solo día se resuelve como ASC (deja el orden físico intacto)', () => {
    const mismoDia = [mov('2026-06-01', '1'), mov('2026-06-01', '2'), mov('2026-06-01', '3')];
    expect(detectarDireccionFisica(mismoDia)).toBe('ASC');
    expect(ordenarCronologico(mismoDia)).toEqual(mismoDia);
  });

  it('lista vacía o de un elemento es ASC (no hay nada que invertir)', () => {
    expect(detectarDireccionFisica([])).toBe('ASC');
    expect(detectarDireccionFisica([mov('2026-06-01', '1')])).toBe('ASC');
  });

  it('detecta NO_MONOTONA cuando el archivo no viene ordenado por fecha', () => {
    const desordenado = [mov('2026-06-05', '1'), mov('2026-06-01', '2'), mov('2026-06-09', '3')];
    expect(detectarDireccionFisica(desordenado)).toBe('NO_MONOTONA');
  });
});

describe('ordenarCronologico', () => {
  it('invierte en BLOQUE un archivo DESC, preservando el desempate dentro del día', () => {
    // Tres movimientos del mismo día en orden físico DESC: el banco los emitió
    // 17:36 → 17:37 → 17:38, así que en el archivo aparecen al revés. Ordenar
    // por fecha con `sort` los dejaría en cualquier orden entre sí (misma
    // fecha); invertir en bloque los restituye a su secuencia real.
    const fisico = [
      mov('2026-06-24', '41000'),
      mov('2026-06-24', '50000'),
      mov('2026-06-24', '45000'),
    ];
    const cronologico = ordenarCronologico([mov('2026-06-25', '9'), ...fisico]);

    expect(cronologico?.map((m) => m.monto.toBob())).toEqual([
      '45000.00',
      '50000.00',
      '41000.00',
      '9.00',
    ]);
  });

  it('deja intacto un archivo ASC', () => {
    const asc = [mov('2026-06-01', '1'), mov('2026-06-02', '2')];
    expect(ordenarCronologico(asc)).toEqual(asc);
  });

  it('devuelve null si no es monótona — el checksum queda SIN_VERIFICAR, nunca inventa', () => {
    expect(
      ordenarCronologico([mov('2026-06-05', '1'), mov('2026-06-01', '2'), mov('2026-06-09', '3')]),
    ).toBeNull();
  });
});
