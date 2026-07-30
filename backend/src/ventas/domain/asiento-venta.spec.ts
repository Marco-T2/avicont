import { Money } from '@/common/domain/money';

import {
  construirAsientoVenta,
  type LineaVentaParaAsiento,
  type VentaContadoParaAsiento,
  type VentaCreditoParaAsiento,
  VentaAsientoDescuadradoError,
  VentaAsientoSinMontoError,
  VentaLineaSubtotalNegativoError,
} from './asiento-venta';

const linea = (over: Partial<LineaVentaParaAsiento> = {}): LineaVentaParaAsiento => ({
  cuentaIngresoId: 'cta-ingreso-aves',
  subtotal: Money.of('100.00'),
  descripcion: 'Pollo entero',
  ...over,
});

const ventaContado = (over: Partial<VentaContadoParaAsiento> = {}): VentaContadoParaAsiento => ({
  condicionPago: 'CONTADO',
  contactoId: 'contacto-avicola-sur',
  cuentaDestinoId: 'cta-bancos',
  montoTotal: Money.of('100.00'),
  lineas: [linea()],
  ...over,
});

const ventaCredito = (over: Partial<VentaCreditoParaAsiento> = {}): VentaCreditoParaAsiento => ({
  condicionPago: 'CREDITO',
  contactoId: 'contacto-avicola-sur',
  cuentasPorCobrarId: 'cta-cxc',
  montoTotal: Money.of('100.00'),
  lineas: [linea()],
  ...over,
});

describe('construirAsientoVenta', () => {
  describe('venta CONTADO (D-04, PA-1)', () => {
    it('debita la cuenta destino ELEGIDA por el montoTotal y acredita la cuenta de ingreso de cada línea', () => {
      const asiento = construirAsientoVenta(
        ventaContado({
          cuentaDestinoId: 'cta-bancos-1112',
          montoTotal: Money.of('450.00'),
          lineas: [
            linea({ cuentaIngresoId: 'cta-ingreso-aves', subtotal: Money.of('300.00') }),
            linea({ cuentaIngresoId: 'cta-ingreso-servicios', subtotal: Money.of('150.00') }),
          ],
        }),
      );

      expect(asiento).toHaveLength(3);
      const [debe, haber1, haber2] = asiento;
      expect(debe?.cuentaId).toBe('cta-bancos-1112');
      expect(debe?.debito.toFixed(2)).toBe('450.00');
      expect(debe?.credito.toFixed(2)).toBe('0.00');
      expect(haber1?.cuentaId).toBe('cta-ingreso-aves');
      expect(haber1?.credito.toFixed(2)).toBe('300.00');
      expect(haber1?.debito.toFixed(2)).toBe('0.00');
      expect(haber2?.cuentaId).toBe('cta-ingreso-servicios');
      expect(haber2?.credito.toFixed(2)).toBe('150.00');
    });

    it('no toca ninguna cuenta que no sea la destino elegida o las de ingreso (CxC fuera del asiento)', () => {
      const asiento = construirAsientoVenta(ventaContado());

      const cuentas = asiento.map((l) => l.cuentaId);
      expect(cuentas).toEqual(['cta-bancos', 'cta-ingreso-aves']);
    });

    it('la línea de débito lleva el contactoId del cliente (fail-safe ante requiereContacto en la cuenta destino)', () => {
      const asiento = construirAsientoVenta(ventaContado({ contactoId: 'contacto-cliente-x' }));

      expect(asiento[0]?.contactoId).toBe('contacto-cliente-x');
    });
  });

  describe('venta CREDITO (B-1)', () => {
    it('debita la cuenta CxC del concepto cuentasPorCobrarId por el montoTotal', () => {
      const asiento = construirAsientoVenta(
        ventaCredito({ cuentasPorCobrarId: 'cta-cxc-112001', montoTotal: Money.of('100.00') }),
      );

      expect(asiento[0]?.cuentaId).toBe('cta-cxc-112001');
      expect(asiento[0]?.debito.toFixed(2)).toBe('100.00');
      expect(asiento[0]?.credito.toFixed(2)).toBe('0.00');
    });

    it('B-1: la línea CxC lleva contactoId = venta.contactoId', () => {
      const asiento = construirAsientoVenta(ventaCredito({ contactoId: 'contacto-avicola-sur' }));

      expect(asiento[0]?.contactoId).toBe('contacto-avicola-sur');
    });
  });

  describe('tri-valor BOB fijo (D-10)', () => {
    it('emite TODAS las líneas con moneda BOB, tipoCambio 1 y espejo exacto debitoBob/creditoBob', () => {
      const asiento = construirAsientoVenta(
        ventaCredito({
          montoTotal: Money.of('250.00'),
          lineas: [
            linea({ subtotal: Money.of('100.00') }),
            linea({ cuentaIngresoId: 'cta-ingreso-otros', subtotal: Money.of('150.00') }),
          ],
        }),
      );

      expect(asiento.length).toBeGreaterThan(0);
      for (const l of asiento) {
        expect(l.moneda).toBe('BOB');
        expect(l.tipoCambio.toFixed(2)).toBe('1.00');
        expect(l.debitoBob.toFixed(2)).toBe(l.debito.toFixed(2));
        expect(l.creditoBob.toFixed(2)).toBe(l.credito.toFixed(2));
      }
    });
  });

  describe('una línea de haber por cada línea de venta (sin agregación)', () => {
    it('dos líneas que comparten cuentaIngresoId emiten DOS líneas de haber, no una agregada', () => {
      const asiento = construirAsientoVenta(
        ventaContado({
          montoTotal: Money.of('500.00'),
          lineas: [
            linea({
              cuentaIngresoId: 'cta-ingreso-aves',
              subtotal: Money.of('200.00'),
              descripcion: 'Pollo entero',
            }),
            linea({
              cuentaIngresoId: 'cta-ingreso-aves',
              subtotal: Money.of('300.00'),
              descripcion: 'Pollo trozado',
            }),
          ],
        }),
      );

      const haberes = asiento.filter((l) => l.credito.greaterThan(0));
      expect(haberes).toHaveLength(2);
      expect(haberes.map((l) => l.credito.toFixed(2))).toEqual(['200.00', '300.00']);
    });

    it('cada haber lleva glosaLinea = descripcion snapshot de su línea; el débito no lleva glosaLinea', () => {
      const asiento = construirAsientoVenta(
        ventaContado({
          montoTotal: Money.of('500.00'),
          lineas: [
            linea({ subtotal: Money.of('200.00'), descripcion: 'Pollo entero' }),
            linea({ subtotal: Money.of('300.00'), descripcion: 'Pollo trozado' }),
          ],
        }),
      );

      expect(asiento.map((l) => l.glosaLinea)).toEqual([null, 'Pollo entero', 'Pollo trozado']);
    });
  });

  describe('cuadre exacto (Código Tributario art. 47, §4.1)', () => {
    it('Σ debitado = Σ acreditado = montoTotal, exacto y no ±0.01', () => {
      const asiento = construirAsientoVenta(
        ventaCredito({
          montoTotal: Money.of('31.53'),
          lineas: [linea({ subtotal: Money.of('31.53') })],
        }),
      );

      const totalDebe = asiento.reduce((acc, l) => acc.plus(Money.of(l.debito)), Money.ZERO);
      const totalHaber = asiento.reduce((acc, l) => acc.plus(Money.of(l.credito)), Money.ZERO);
      expect(totalDebe.equals('31.53')).toBe(true);
      expect(totalHaber.equals('31.53')).toBe(true);
    });

    it('montoTotal distinto de Σ subtotales lanza VENTA_ASIENTO_DESCUADRADO — incluso por Bs 0.01', () => {
      const armar = () =>
        construirAsientoVenta(
          ventaContado({
            montoTotal: Money.of('100.01'),
            lineas: [linea({ subtotal: Money.of('100.00') })],
          }),
        );

      expect(armar).toThrow(VentaAsientoDescuadradoError);
      try {
        armar();
      } catch (e) {
        expect(e).toBeInstanceOf(VentaAsientoDescuadradoError);
        expect((e as VentaAsientoDescuadradoError).code).toBe('VENTA_ASIENTO_DESCUADRADO');
      }
    });
  });

  describe('bordes', () => {
    it('una línea con subtotal 0 se omite del asiento (§4.1: una línea nunca es 0/0) y el documento la conserva', () => {
      const asiento = construirAsientoVenta(
        ventaContado({
          montoTotal: Money.of('200.00'),
          lineas: [
            linea({ subtotal: Money.of('200.00') }),
            linea({ cuentaIngresoId: 'cta-ingreso-bonif', subtotal: Money.ZERO }),
          ],
        }),
      );

      expect(asiento).toHaveLength(2);
      expect(asiento.map((l) => l.cuentaId)).not.toContain('cta-ingreso-bonif');
    });

    it('montoTotal 0 lanza VENTA_ASIENTO_SIN_MONTO (§4.1: suma total > 0)', () => {
      expect(() =>
        construirAsientoVenta(
          ventaContado({ montoTotal: Money.ZERO, lineas: [linea({ subtotal: Money.ZERO })] }),
        ),
      ).toThrow(VentaAsientoSinMontoError);
    });

    it('un subtotal negativo lanza VENTA_LINEA_SUBTOTAL_NEGATIVO (§4.1: débitos y créditos ≥ 0)', () => {
      expect(() =>
        construirAsientoVenta(
          ventaContado({
            montoTotal: Money.of('50.00'),
            lineas: [
              linea({ subtotal: Money.of('100.00') }),
              linea({ subtotal: Money.of('-50.00') }),
            ],
          }),
        ),
      ).toThrow(VentaLineaSubtotalNegativoError);
    });
  });
});
