import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { MovimientoParseado } from '../ports/extracto-parser.port';
import { verificarChecksum } from './checksum-extracto';

function mov(partial: {
  monto: string;
  tipo: 'DEBITO' | 'CREDITO';
  saldo?: string | null;
}): MovimientoParseado {
  return {
    fecha: FechaContable.fromIso('2026-06-03'),
    hora: null,
    monto: Money.of(partial.monto),
    tipo: partial.tipo,
    descripcion: 'X',
    referencia: null,
    saldo:
      partial.saldo === undefined ? null : partial.saldo === null ? null : Money.of(partial.saldo),
    contraparteNombre: null,
    contraparteDocumento: null,
    datosOriginales: {},
  };
}

describe('verificarChecksum (REQ-CB-08, design §4.2)', () => {
  describe('estrategia DECLARADO', () => {
    it('cuadra — caso real Económico XLSX: 327.520,14 + (−147.762,77) = 179.757,37', () => {
      const movimientos = [mov({ monto: '147762.77', tipo: 'DEBITO' })];
      const resultado = verificarChecksum('DECLARADO', movimientos, {
        saldoInicialDeclarado: Money.of('327520.14'),
        saldoFinalDeclarado: Money.of('179757.37'),
      });
      expect(resultado.estadoVerificacion).toBe('VERIFICADO');
      expect(resultado.diferencia).toBeNull();
    });

    it('no cuadra → DESCUADRE con diferencia calculada, NUNCA rechaza', () => {
      const movimientos = [mov({ monto: '100.00', tipo: 'DEBITO' })];
      const resultado = verificarChecksum('DECLARADO', movimientos, {
        saldoInicialDeclarado: Money.of('1000.00'),
        saldoFinalDeclarado: Money.of('850.00'), // esperado 900.00, declarado 850.00 → diff 50
      });
      expect(resultado.estadoVerificacion).toBe('DESCUADRE');
      expect(resultado.diferencia?.toBob()).toBe('50.00');
    });

    it('usa Money.igualaConTolerancia — diferencia de 0.01 sigue VERIFICADO', () => {
      const movimientos = [mov({ monto: '100.00', tipo: 'DEBITO' })];
      const resultado = verificarChecksum('DECLARADO', movimientos, {
        saldoInicialDeclarado: Money.of('1000.00'),
        saldoFinalDeclarado: Money.of('900.01'), // esperado 900.00, diff 0.01 → dentro de tolerancia
      });
      expect(resultado.estadoVerificacion).toBe('VERIFICADO');
    });

    it('CREDITO suma al neto, DEBITO resta', () => {
      const movimientos = [
        mov({ monto: '500.00', tipo: 'CREDITO' }),
        mov({ monto: '200.00', tipo: 'DEBITO' }),
      ];
      const resultado = verificarChecksum('DECLARADO', movimientos, {
        saldoInicialDeclarado: Money.of('1000.00'),
        saldoFinalDeclarado: Money.of('1300.00'), // 1000 + 500 - 200 = 1300
      });
      expect(resultado.estadoVerificacion).toBe('VERIFICADO');
    });

    it('sin saldo inicial/final declarado → SIN_VERIFICAR, nunca finge', () => {
      const movimientos = [mov({ monto: '100.00', tipo: 'DEBITO' })];
      const resultado = verificarChecksum('DECLARADO', movimientos, {
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: Money.of('900.00'),
      });
      expect(resultado.estadoVerificacion).toBe('SIN_VERIFICAR');
    });
  });

  describe('estrategia DERIVADO', () => {
    it('deriva de la fila más antigua tras ordenarCanonico — caso real BancoSol: 3.275,55 + (−3.040,38) = 235,17', () => {
      // Una sola fila: DEBITO 3040.38, saldo corrido tras el movimiento = 235.17.
      // saldoInicial derivado = saldo + monto (rama DEBITO) = 235.17 + 3040.38 = 3275.55.
      const movimientos = [mov({ monto: '3040.38', tipo: 'DEBITO', saldo: '235.17' })];
      const resultado = verificarChecksum('DERIVADO', movimientos, {
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: null,
      });
      expect(resultado.estadoVerificacion).toBe('VERIFICADO');
      expect(resultado.diferencia).toBeNull();
    });

    it('toma la PRIMERA fila del array recibido como "más antigua" (precondición: ya viene de ordenarCanonico)', () => {
      // primer elemento CREDITO 100, saldo 600 (⇒ saldoInicial derivado = 600 - 100 = 500)
      // segundo elemento CREDITO 50 (neto total = 150) ⇒ saldoEsperado = 500 + 150 = 650
      // último elemento.saldo debe ser 650 para VERIFICADO
      const movimientos = [
        mov({ monto: '100.00', tipo: 'CREDITO', saldo: '600.00' }),
        mov({ monto: '50.00', tipo: 'CREDITO', saldo: '650.00' }),
      ];
      const resultado = verificarChecksum('DERIVADO', movimientos, {
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: null,
      });
      expect(resultado.estadoVerificacion).toBe('VERIFICADO');
    });

    it('no cuadra → DESCUADRE con diferencia, nunca rechaza', () => {
      const movimientos = [mov({ monto: '100.00', tipo: 'DEBITO', saldo: '400.00' })];
      // saldoInicial derivado = 400 + 100 = 500; neto = -100; esperado = 400.
      // Pero forzamos que el "saldo final" (mismo row, único elemento) sea 400 —
      // para provocar descuadre agregamos una segunda fila cuyo saldo no cierra.
      const conDescuadre = [
        mov({ monto: '100.00', tipo: 'DEBITO', saldo: '400.00' }),
        mov({ monto: '50.00', tipo: 'CREDITO', saldo: '999.00' }), // debería ser 450.00
      ];
      const resultado = verificarChecksum('DERIVADO', conDescuadre, {
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: null,
      });
      expect(resultado.estadoVerificacion).toBe('DESCUADRE');
      expect(resultado.diferencia?.toBob()).toBe('549.00');
      expect(movimientos).toHaveLength(1); // sanity: no se usó en este caso
    });

    it('sin columna saldo en las filas → SIN_VERIFICAR, nunca finge', () => {
      const movimientos = [mov({ monto: '100.00', tipo: 'DEBITO', saldo: null })];
      const resultado = verificarChecksum('DERIVADO', movimientos, {
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: null,
      });
      expect(resultado.estadoVerificacion).toBe('SIN_VERIFICAR');
    });
  });

  describe('estrategia IMPOSIBLE', () => {
    it('siempre SIN_VERIFICAR — el formato no trae columna de saldo', () => {
      const movimientos = [mov({ monto: '100.00', tipo: 'DEBITO' })];
      const resultado = verificarChecksum('IMPOSIBLE', movimientos, {
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: null,
      });
      expect(resultado.estadoVerificacion).toBe('SIN_VERIFICAR');
      expect(resultado.diferencia).toBeNull();
    });
  });

  it('lista vacía → SIN_VERIFICAR para cualquier estrategia (nada que verificar)', () => {
    expect(
      verificarChecksum('DECLARADO', [], {
        saldoInicialDeclarado: Money.of('100'),
        saldoFinalDeclarado: Money.of('100'),
      }).estadoVerificacion,
    ).toBe('SIN_VERIFICAR');
    expect(
      verificarChecksum('DERIVADO', [], { saldoInicialDeclarado: null, saldoFinalDeclarado: null })
        .estadoVerificacion,
    ).toBe('SIN_VERIFICAR');
  });
});
