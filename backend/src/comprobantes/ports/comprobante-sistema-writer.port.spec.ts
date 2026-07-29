import {
  esOrigenComercial,
  ORIGEN_TIPO_COBRO,
  ORIGEN_TIPO_VENTA,
  ORIGENES_COMERCIALES,
  type OrigenTipoComercial,
} from './comprobante-sistema-writer.port';

/**
 * Los `origenTipo` son strings libres en el schema, comparados en varios lugares
 * (Anti-09). Estos tests congelan los VALORES —no solo los nombres de las
 * constantes—, porque un cambio de valor rompe la idempotencia de todos los
 * comprobantes ya generados: `@@unique(organizationId, origenTipo, origenId)`
 * dejaría de encontrarlos y el generador crearía duplicados en silencio.
 */
describe('origen comercial de un comprobante', () => {
  describe('valores del contrato', () => {
    it('la venta usa el literal "VENTA"', () => {
      expect(ORIGEN_TIPO_VENTA).toBe('VENTA');
    });

    it('el cobro usa el literal "COBRO"', () => {
      expect(ORIGEN_TIPO_COBRO).toBe('COBRO');
    });

    it('el catálogo enumera exactamente los dos orígenes comerciales', () => {
      expect(ORIGENES_COMERCIALES).toEqual(['VENTA', 'COBRO']);
    });
  });

  describe('esOrigenComercial', () => {
    it('reconoce el origen de una venta', () => {
      expect(esOrigenComercial(ORIGEN_TIPO_VENTA)).toBe(true);
    });

    it('reconoce el origen de un cobro', () => {
      expect(esOrigenComercial(ORIGEN_TIPO_COBRO)).toBe(true);
    });

    // Un comprobante manual del contador no tiene origen: es el caso mayoritario
    // y no debe quedar atrapado por la guarda de anulación (REQ-CMP-VTA-04).
    it('un comprobante sin origen NO es comercial', () => {
      expect(esOrigenComercial(null)).toBe(false);
      expect(esOrigenComercial(undefined)).toBe(false);
    });

    // Los tres orígenes del cierre de ejercicio conviven en la misma columna y
    // tienen su propia regla de anulación (REQ-CMP-SYS-06): no deben colarse acá.
    it.each(['CIERRE_GASTOS', 'CIERRE_INGRESOS', 'CIERRE_RESULTADO'])(
      'el origen de cierre %s NO es comercial',
      (origen) => {
        expect(esOrigenComercial(origen)).toBe(false);
      },
    );

    it('un origen desconocido NO es comercial', () => {
      expect(esOrigenComercial('COMPRA')).toBe(false);
      expect(esOrigenComercial('')).toBe(false);
    });

    // Comparación exacta: sin esto, un `startsWith`/`includes` mal escrito
    // clasificaría 'VENTAS' o 'PREVENTA' como comerciales.
    it('no matchea por prefijo ni por substring', () => {
      expect(esOrigenComercial('VENTAS')).toBe(false);
      expect(esOrigenComercial('PREVENTA')).toBe(false);
      expect(esOrigenComercial('venta')).toBe(false);
    });
  });

  // Congela la exhaustividad: si mañana se suma un origen comercial al tipo y se
  // olvida en el array, este test lo señala. El `satisfies` del array cubre la
  // dirección contraria (un valor que no pertenece al tipo no compila).
  describe('exhaustividad del catálogo', () => {
    it('todo valor del tipo OrigenTipoComercial está en el catálogo', () => {
      const declarados: Record<OrigenTipoComercial, true> = {
        VENTA: true,
        COBRO: true,
      };
      expect([...ORIGENES_COMERCIALES].sort()).toEqual(Object.keys(declarados).sort());
    });
  });
});
