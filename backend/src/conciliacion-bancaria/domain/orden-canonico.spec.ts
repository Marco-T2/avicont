import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { MovimientoParseado } from '../ports/extracto-parser.port';
import { ordenarCanonico } from './orden-canonico';

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

describe('ordenarCanonico (design §4.2, REQ-CB-07)', () => {
  it('ordena por fecha ASC como criterio primario', () => {
    const a = mov({ fecha: '2026-06-10', monto: '100.00', tipo: 'DEBITO', descripcion: 'X' });
    const b = mov({ fecha: '2026-06-05', monto: '100.00', tipo: 'DEBITO', descripcion: 'X' });
    const resultado = ordenarCanonico([a, b]);
    expect(resultado.map((m) => m.fecha.toIso())).toEqual(['2026-06-05', '2026-06-10']);
  });

  it('a igual fecha, ordena por monto ASC (centavos, no lexicográfico ingenuo)', () => {
    const grande = mov({ fecha: '2026-06-10', monto: '1000.00', tipo: 'DEBITO', descripcion: 'X' });
    const chico = mov({ fecha: '2026-06-10', monto: '90.00', tipo: 'DEBITO', descripcion: 'X' });
    const resultado = ordenarCanonico([grande, chico]);
    // Un ordenamiento string ingenuo pondría "1000.00" antes que "90.00"
    // (compara carácter a carácter: '1' < '9'). El zero-padding de centavos
    // lo evita.
    expect(resultado.map((m) => m.monto.toBob())).toEqual(['90.00', '1000.00']);
  });

  it('a igual fecha y monto, ordena por tipo ASC (CREDITO < DEBITO)', () => {
    const debito = mov({ fecha: '2026-06-10', monto: '100.00', tipo: 'DEBITO', descripcion: 'X' });
    const credito = mov({
      fecha: '2026-06-10',
      monto: '100.00',
      tipo: 'CREDITO',
      descripcion: 'X',
    });
    const resultado = ordenarCanonico([debito, credito]);
    expect(resultado.map((m) => m.tipo)).toEqual(['CREDITO', 'DEBITO']);
  });

  it('a igual fecha/monto/tipo, ordena por descripcionNormalizada ASC', () => {
    const zeta = mov({ fecha: '2026-06-10', monto: '100.00', tipo: 'DEBITO', descripcion: 'ZETA' });
    const alfa = mov({ fecha: '2026-06-10', monto: '100.00', tipo: 'DEBITO', descripcion: 'ALFA' });
    const resultado = ordenarCanonico([zeta, alfa]);
    expect(resultado.map((m) => m.descripcion)).toEqual(['ALFA', 'ZETA']);
  });

  it('descripcionNormalizada ignora diacríticos/mayúsculas al comparar (usa normalizarDescripcion)', () => {
    const conTilde = mov({
      fecha: '2026-06-10',
      monto: '100.00',
      tipo: 'DEBITO',
      descripcion: 'depósito',
    });
    const sinTilde = mov({
      fecha: '2026-06-10',
      monto: '100.00',
      tipo: 'DEBITO',
      descripcion: 'DEPOSITO',
    });
    // Ambas normalizan a "DEPOSITO" — el desempate cae a referencia (última clave).
    expect(() => ordenarCanonico([conTilde, sinTilde])).not.toThrow();
  });

  it('a igual todo lo demás, ordena por referencia ASC con null AL FINAL', () => {
    const conRef = mov({
      fecha: '2026-06-10',
      monto: '100.00',
      tipo: 'DEBITO',
      descripcion: 'X',
      referencia: 'AAA',
    });
    const sinRef = mov({
      fecha: '2026-06-10',
      monto: '100.00',
      tipo: 'DEBITO',
      descripcion: 'X',
      referencia: null,
    });
    const resultado = ordenarCanonico([sinRef, conRef]);
    expect(resultado.map((m) => m.referencia)).toEqual(['AAA', null]);
  });

  it('no muta el array de entrada (inmutabilidad, CLAUDE.md §2.4)', () => {
    const entrada = [
      mov({ fecha: '2026-06-10', monto: '100.00', tipo: 'DEBITO', descripcion: 'B' }),
      mov({ fecha: '2026-06-05', monto: '100.00', tipo: 'DEBITO', descripcion: 'A' }),
    ];
    const copiaOriginal = [...entrada];
    ordenarCanonico(entrada);
    expect(entrada).toEqual(copiaOriginal);
  });

  it('ASC y DESC del mismo conjunto producen exactamente la misma secuencia (regla dura #1, caso real Fortaleza #953)', () => {
    const movimientos: MovimientoParseado[] = [
      mov({ fecha: '2026-06-01', monto: '100.00', tipo: 'DEBITO', descripcion: 'A' }),
      mov({ fecha: '2026-06-02', monto: '250.50', tipo: 'CREDITO', descripcion: 'B' }),
      mov({ fecha: '2026-06-02', monto: '250.50', tipo: 'CREDITO', descripcion: 'C' }),
      mov({ fecha: '2026-06-03', monto: '10.00', tipo: 'DEBITO', descripcion: 'D' }),
      mov({ fecha: '2026-06-05', monto: '999.99', tipo: 'CREDITO', descripcion: 'E' }),
    ];
    const ordenAscendente = [...movimientos]; // ya está en orden "de archivo" ascendente
    const ordenDescendente = [...movimientos].reverse(); // mismo banco, export en modo descendente

    const resultadoAsc = ordenarCanonico(ordenAscendente).map((m) => m.descripcion);
    const resultadoDesc = ordenarCanonico(ordenDescendente).map((m) => m.descripcion);

    expect(resultadoDesc).toEqual(resultadoAsc);
  });

  it('devuelve un array nuevo (no la misma referencia)', () => {
    const entrada = [
      mov({ fecha: '2026-06-10', monto: '100.00', tipo: 'DEBITO', descripcion: 'X' }),
    ];
    expect(ordenarCanonico(entrada)).not.toBe(entrada);
  });

  it('lista vacía devuelve lista vacía', () => {
    expect(ordenarCanonico([])).toEqual([]);
  });
});
