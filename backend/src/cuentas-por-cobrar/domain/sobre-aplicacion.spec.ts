import { Money } from '@/common/domain/money';

import {
  AplicacionContactoDistintoError,
  AplicacionExcedeCobroError,
  AplicacionExcedeVentaError,
} from './cobro-errors';
import {
  AplicacionMontoNoPositivoError,
  type SumasAplicacion,
  verificarMismoContacto,
  verificarSobreAplicacion,
} from './sobre-aplicacion';

const sumas = (over: {
  montoCobro?: string;
  aplicadoCobro?: string;
  montoTotalVenta?: string;
  aplicadoVenta?: string;
}): SumasAplicacion => ({
  cobro: {
    id: 'cobro-1',
    monto: Money.of(over.montoCobro ?? '500.00'),
    totalAplicado: Money.of(over.aplicadoCobro ?? '0'),
  },
  venta: {
    id: 'venta-1',
    montoTotal: Money.of(over.montoTotalVenta ?? '1000.00'),
    totalAplicado: Money.of(over.aplicadoVenta ?? '0'),
  },
});

describe('verificarSobreAplicacion (REQ-CXC-04)', () => {
  describe('invariante Σ montoAplicado(cobro) ≤ cobro.monto', () => {
    it('escenario spec: cobro de 500 con 400 aplicados rechaza aplicar 200 con APLICACION_EXCEDE_COBRO', () => {
      const armar = () =>
        verificarSobreAplicacion(sumas({ aplicadoCobro: '400.00' }), Money.of('200.00'));

      expect(armar).toThrow(AplicacionExcedeCobroError);
      try {
        armar();
      } catch (e) {
        expect(e).toBeInstanceOf(AplicacionExcedeCobroError);
        const err = e as AplicacionExcedeCobroError;
        expect(err.code).toBe('APLICACION_EXCEDE_COBRO');
        // details accionables: cuánto había, cuánto se pidió, cuánto queda.
        expect(err.details).toMatchObject({
          cobroId: 'cobro-1',
          montoCobroBob: '500.00',
          totalAplicadoBob: '400.00',
          montoSolicitadoBob: '200.00',
          disponibleBob: '100.00',
        });
      }
    });

    it('aplicar EXACTAMENTE el disponible del cobro es válido (borde: ≤, no <)', () => {
      expect(() =>
        verificarSobreAplicacion(sumas({ aplicadoCobro: '400.00' }), Money.of('100.00')),
      ).not.toThrow();
    });

    it('excederse por Bs 0.01 ya rechaza — no hay tolerancia sobre el invariante', () => {
      expect(() =>
        verificarSobreAplicacion(sumas({ aplicadoCobro: '400.00' }), Money.of('100.01')),
      ).toThrow(AplicacionExcedeCobroError);
    });
  });

  describe('invariante Σ montoAplicado(venta) ≤ venta.montoTotal', () => {
    it('escenario spec: venta de 1000 con 900 aplicados rechaza aplicar 200 con APLICACION_EXCEDE_VENTA', () => {
      const armar = () =>
        verificarSobreAplicacion(sumas({ aplicadoVenta: '900.00' }), Money.of('200.00'));

      expect(armar).toThrow(AplicacionExcedeVentaError);
      try {
        armar();
      } catch (e) {
        expect(e).toBeInstanceOf(AplicacionExcedeVentaError);
        const err = e as AplicacionExcedeVentaError;
        expect(err.code).toBe('APLICACION_EXCEDE_VENTA');
        expect(err.details).toMatchObject({
          ventaId: 'venta-1',
          montoTotalVentaBob: '1000.00',
          totalAplicadoBob: '900.00',
          montoSolicitadoBob: '200.00',
          disponibleBob: '100.00',
        });
      }
    });

    it('saldar EXACTAMENTE la venta es válido (borde: ≤, no <)', () => {
      expect(() =>
        verificarSobreAplicacion(sumas({ aplicadoVenta: '900.00' }), Money.of('100.00')),
      ).not.toThrow();
    });

    it('excederse por Bs 0.01 ya rechaza', () => {
      expect(() =>
        verificarSobreAplicacion(sumas({ aplicadoVenta: '900.00' }), Money.of('100.01')),
      ).toThrow(AplicacionExcedeVentaError);
    });
  });

  describe('orden de los chequeos', () => {
    it('si excede a AMBOS, reporta primero el cobro (la plata que el usuario está repartiendo)', () => {
      expect(() =>
        verificarSobreAplicacion(
          sumas({ aplicadoCobro: '500.00', aplicadoVenta: '1000.00' }),
          Money.of('50.00'),
        ),
      ).toThrow(AplicacionExcedeCobroError);
    });
  });

  describe('montoAplicado > 0 (REQ-CXC-03)', () => {
    it('aplicar 0 rechaza con APLICACION_MONTO_NO_POSITIVO', () => {
      expect(() => verificarSobreAplicacion(sumas({}), Money.ZERO)).toThrow(
        AplicacionMontoNoPositivoError,
      );
    });

    it('aplicar un monto negativo rechaza — un negativo "libera" cupo y sobre-aplica plata en silencio', () => {
      expect(() => verificarSobreAplicacion(sumas({}), Money.of('-10.00'))).toThrow(
        AplicacionMontoNoPositivoError,
      );
    });
  });
});

describe('verificarMismoContacto (REQ-CXC-03)', () => {
  it('cobro y venta del mismo contacto pasa', () => {
    expect(() => verificarMismoContacto('contacto-a', 'contacto-a')).not.toThrow();
  });

  it('escenario spec (−): cobro del cliente A sobre venta del cliente B rechaza con APLICACION_CONTACTO_DISTINTO', () => {
    const armar = () => verificarMismoContacto('contacto-a', 'contacto-b');

    expect(armar).toThrow(AplicacionContactoDistintoError);
    try {
      armar();
    } catch (e) {
      const err = e as AplicacionContactoDistintoError;
      expect(err.code).toBe('APLICACION_CONTACTO_DISTINTO');
      expect(err.details).toMatchObject({
        contactoCobroId: 'contacto-a',
        contactoVentaId: 'contacto-b',
      });
    }
  });
});
