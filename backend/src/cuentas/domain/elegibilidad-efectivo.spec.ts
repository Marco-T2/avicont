import { ActividadFlujo } from '@/common/domain/enums';

import {
  esElegibleComoDestinoDeEfectivo,
  type CuentaParaElegibilidad,
} from './elegibilidad-efectivo';

/**
 * REQ-CXC-02: elegibilidad de una cuenta como destino de cobro / venta CONTADO.
 *
 *     activa ∧ esDetalle ∧ ( actividadFlujo = 'EFECTIVO'  ∨  código bajo 1.1.1 )
 *
 * Es una UNIÓN evaluada POR CUENTA. Los dos tests marcados «DISCRIMINA» son los
 * que separan esta regla de las dos que se descartaron; sin ellos, una
 * implementación equivocada pasa en verde.
 */
describe('esElegibleComoDestinoDeEfectivo', () => {
  const cuenta = (over: Partial<CuentaParaElegibilidad> = {}): CuentaParaElegibilidad => ({
    codigoInterno: '1.1.1.001',
    esDetalle: true,
    activa: true,
    actividadFlujo: null,
    ...over,
  });

  describe('camino feliz', () => {
    it('acepta una cuenta bajo el prefijo sin marca (heurística del plan)', () => {
      expect(esElegibleComoDestinoDeEfectivo(cuenta())).toBe(true);
    });

    it('acepta una cuenta FUERA del prefijo marcada EFECTIVO (la marca agrega)', () => {
      expect(
        esElegibleComoDestinoDeEfectivo(
          cuenta({ codigoInterno: '1.2.3.001', actividadFlujo: ActividadFlujo.EFECTIVO }),
        ),
      ).toBe(true);
    });
  });

  describe('rechazos', () => {
    it('rechaza una cuenta inactiva aunque cumpla el resto (§4.1)', () => {
      expect(esElegibleComoDestinoDeEfectivo(cuenta({ activa: false }))).toBe(false);
    });

    it('rechaza una agrupadora aunque cumpla el resto (§4.1)', () => {
      expect(esElegibleComoDestinoDeEfectivo(cuenta({ esDetalle: false }))).toBe(false);
    });

    it('rechaza una cuenta fuera del prefijo y sin marca', () => {
      expect(esElegibleComoDestinoDeEfectivo(cuenta({ codigoInterno: '5.1.1.001' }))).toBe(false);
    });

    it('rechaza una cuenta fuera del prefijo marcada con OTRA actividad', () => {
      expect(
        esElegibleComoDestinoDeEfectivo(
          cuenta({ codigoInterno: '1.2.3.001', actividadFlujo: ActividadFlujo.INVERSION }),
        ),
      ).toBe(false);
    });
  });

  describe('DISCRIMINA — unión, no fallback', () => {
    // Con "explícito, o EN SU DEFECTO el prefijo", esta cuenta NO sería elegible:
    // tiene marca, la marca no es EFECTIVO, fin. Con la unión SÍ lo es, porque
    // el prefijo alcanza por sí solo y la marca únicamente AGREGA.
    it('una cuenta bajo el prefijo marcada OPERACION SIGUE siendo elegible', () => {
      expect(
        esElegibleComoDestinoDeEfectivo(
          cuenta({ codigoInterno: '1.1.1.001', actividadFlujo: ActividadFlujo.OPERACION }),
        ),
      ).toBe(true);
    });
  });

  describe('DISCRIMINA — por cuenta, no por organización', () => {
    // El EFE apaga la heurística del prefijo para TODA la org en cuanto alguna
    // cuenta está marcada EFECTIVO. Acá no: marcar BANCOS no puede sacar a CAJA
    // —el default operativo del cobro (D-05)— del conjunto elegible.
    it('marcar una cuenta como EFECTIVO no afecta la elegibilidad de otra', () => {
      const caja = cuenta({ codigoInterno: '1.1.1.001', actividadFlujo: null });
      const bancos = cuenta({
        codigoInterno: '1.1.1.002',
        actividadFlujo: ActividadFlujo.EFECTIVO,
      });

      expect(esElegibleComoDestinoDeEfectivo(bancos)).toBe(true);
      expect(esElegibleComoDestinoDeEfectivo(caja)).toBe(true);
    });
  });

  describe('borde del prefijo', () => {
    it('no confunde un hermano cuyo código empieza igual (1.1.10 vs 1.1.1)', () => {
      expect(esElegibleComoDestinoDeEfectivo(cuenta({ codigoInterno: '1.1.10.001' }))).toBe(false);
    });
  });
});
