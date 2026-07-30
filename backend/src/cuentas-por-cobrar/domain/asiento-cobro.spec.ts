import { Money } from '@/common/domain/money';

import {
  CobroAsientoSinMontoError,
  construirAsientoCobro,
  type CobroParaAsiento,
} from './asiento-cobro';

const cobro = (over: Partial<CobroParaAsiento> = {}): CobroParaAsiento => ({
  contactoId: 'contacto-avicola-sur',
  monto: Money.of('500.00'),
  cuentaDestinoId: 'cta-caja-general',
  cuentasPorCobrarId: 'cta-cxc-112001',
  ...over,
});

describe('construirAsientoCobro (REQ-CXC-02)', () => {
  it('el asiento es SIEMPRE Debe cuenta destino / Haber CxC por el monto, se aplique a lo que se aplique', () => {
    const asiento = construirAsientoCobro(cobro({ monto: Money.of('500.00') }));

    expect(asiento).toHaveLength(2);
    const [debe, haber] = asiento;
    expect(debe?.cuentaId).toBe('cta-caja-general');
    expect(debe?.debito.toString()).toBe('500');
    expect(debe?.credito.toString()).toBe('0');
    expect(haber?.cuentaId).toBe('cta-cxc-112001');
    expect(haber?.credito.toString()).toBe('500');
    expect(haber?.debito.toString()).toBe('0');
  });

  it('B-1: la línea Haber CxC lleva contactoId = cobro.contactoId (la cuenta CxC exige contacto)', () => {
    const asiento = construirAsientoCobro(cobro({ contactoId: 'contacto-cliente-x' }));

    const haberCxc = asiento.find((l) => l.cuentaId === 'cta-cxc-112001');
    expect(haberCxc?.contactoId).toBe('contacto-cliente-x');
  });

  it('la línea de débito también lleva el contactoId (fail-safe ante requiereContacto en la cuenta destino)', () => {
    const asiento = construirAsientoCobro(cobro({ contactoId: 'contacto-cliente-x' }));

    expect(asiento[0]?.contactoId).toBe('contacto-cliente-x');
  });

  it('el débito va primero: el writer asigna orden por posición y el debe se presenta arriba', () => {
    const asiento = construirAsientoCobro(cobro());

    expect(asiento[0]?.debito.greaterThan(0)).toBe(true);
    expect(asiento[1]?.credito.greaterThan(0)).toBe(true);
  });

  it('tri-valor BOB fijo (D-10): moneda BOB, tipoCambio 1 y espejo exacto debitoBob/creditoBob', () => {
    const asiento = construirAsientoCobro(cobro({ monto: Money.of('123.45') }));

    expect(asiento.length).toBeGreaterThan(0);
    for (const l of asiento) {
      expect(l.moneda).toBe('BOB');
      expect(l.tipoCambio.toString()).toBe('1');
      expect(l.debitoBob.toString()).toBe(l.debito.toString());
      expect(l.creditoBob.toString()).toBe(l.credito.toString());
    }
  });

  it('ninguna línea lleva glosaLinea: la glosa de cabecera (Q-2) es autosuficiente y no hay detalle por línea', () => {
    const asiento = construirAsientoCobro(cobro());

    expect(asiento.map((l) => l.glosaLinea)).toEqual([null, null]);
  });

  describe('cuadre exacto (Código Tributario art. 47, §4.1)', () => {
    it('Σ debitado = Σ acreditado = monto, exacto y no ±0.01', () => {
      const asiento = construirAsientoCobro(cobro({ monto: Money.of('31.53') }));

      const totalDebe = asiento.reduce((acc, l) => acc.plus(Money.of(l.debito)), Money.ZERO);
      const totalHaber = asiento.reduce((acc, l) => acc.plus(Money.of(l.credito)), Money.ZERO);
      expect(totalDebe.toString()).toBe('31.53');
      expect(totalHaber.toString()).toBe('31.53');
    });
  });

  describe('bordes', () => {
    it('monto 0 lanza COBRO_ASIENTO_SIN_MONTO (§4.1: suma total > 0)', () => {
      const armar = () => construirAsientoCobro(cobro({ monto: Money.ZERO }));

      expect(armar).toThrow(CobroAsientoSinMontoError);
      try {
        armar();
      } catch (e) {
        expect((e as CobroAsientoSinMontoError).code).toBe('COBRO_ASIENTO_SIN_MONTO');
      }
    });

    it('monto negativo lanza COBRO_ASIENTO_SIN_MONTO (§4.1: débitos y créditos ≥ 0)', () => {
      expect(() => construirAsientoCobro(cobro({ monto: Money.of('-500.00') }))).toThrow(
        CobroAsientoSinMontoError,
      );
    });

    it('Bs 0.01 es el mínimo que emite asiento (borde exacto del guard: > 0, no ≥ 0)', () => {
      const asiento = construirAsientoCobro(cobro({ monto: Money.of('0.01') }));

      expect(asiento).toHaveLength(2);
      expect(asiento[0]?.debito.toString()).toBe('0.01');
    });
  });
});
