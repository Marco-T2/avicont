import { Prisma } from '@prisma/client';

import { Moneda } from '@/common/domain/enums';
import { FechaContable } from '@/common/domain/fecha-contable';

import {
  ComprobanteDesbalanceadoError,
  ComprobanteMontoCeroError,
  ComprobanteSinLineasError,
  FechaFuturaNoPermitidaError,
  GlosaRequeridaError,
  LineaAmbiguaDebitoCreditoError,
  LineaSinMontoError,
  MontoBobIncoherenteError,
  TipoCambioInvalidoError,
} from './comprobante-errors';
import {
  calcularTotalesBob,
  validarComprobanteParaContabilizar,
  validarFechaNoFutura,
  validarGlosa,
  validarLinea,
  validarMinimoLineas,
  validarMontoPositivo,
  validarPartidaDoble,
  type LineaParaValidar,
} from './comprobante-validator';

// ------------------------------------------------------------
// Fixtures mínimos
// ------------------------------------------------------------

const HOY = FechaContable.fromIso('2026-04-22');
const LINEA_DEBITO_BOB_1000: LineaParaValidar = {
  orden: 1,
  moneda: Moneda.BOB,
  debito: '1000.00',
  credito: '0',
  tipoCambio: '1',
  debitoBob: '1000.00',
  creditoBob: '0',
};
const LINEA_CREDITO_BOB_1000: LineaParaValidar = {
  orden: 2,
  moneda: Moneda.BOB,
  debito: '0',
  credito: '1000.00',
  tipoCambio: '1',
  debitoBob: '0',
  creditoBob: '1000.00',
};

// ------------------------------------------------------------
// validarGlosa
// ------------------------------------------------------------

describe('validarGlosa', () => {
  it('acepta glosa con texto', () => {
    expect(() => validarGlosa('Venta al contado')).not.toThrow();
  });

  it('rechaza glosa vacía', () => {
    expect(() => validarGlosa('')).toThrow(GlosaRequeridaError);
  });

  it('rechaza glosa solo espacios', () => {
    expect(() => validarGlosa('   ')).toThrow(GlosaRequeridaError);
  });

  it('rechaza glosa de tipo inválido', () => {
    expect(() => validarGlosa(undefined as unknown as string)).toThrow(GlosaRequeridaError);
    expect(() => validarGlosa(null as unknown as string)).toThrow(GlosaRequeridaError);
  });
});

// ------------------------------------------------------------
// validarFechaNoFutura
// ------------------------------------------------------------

describe('validarFechaNoFutura', () => {
  it('acepta fecha igual a hoy', () => {
    const hoy = FechaContable.fromIso('2026-04-22');
    expect(() => validarFechaNoFutura(hoy, hoy)).not.toThrow();
  });

  it('acepta fecha pasada', () => {
    const ayer = FechaContable.fromIso('2026-04-21');
    expect(() => validarFechaNoFutura(ayer, HOY)).not.toThrow();
  });

  it('rechaza fecha futura', () => {
    const manana = FechaContable.fromIso('2026-04-23');
    expect(() => validarFechaNoFutura(manana, HOY)).toThrow(FechaFuturaNoPermitidaError);
  });
});

// ------------------------------------------------------------
// validarMinimoLineas
// ------------------------------------------------------------

describe('validarMinimoLineas', () => {
  it('acepta 2 líneas', () => {
    expect(() => validarMinimoLineas({ length: 2 })).not.toThrow();
  });

  it('acepta más de 2 líneas', () => {
    expect(() => validarMinimoLineas({ length: 10 })).not.toThrow();
  });

  it('rechaza 0 líneas', () => {
    expect(() => validarMinimoLineas({ length: 0 })).toThrow(ComprobanteSinLineasError);
  });

  it('rechaza 1 línea', () => {
    expect(() => validarMinimoLineas({ length: 1 })).toThrow(ComprobanteSinLineasError);
  });
});

// ------------------------------------------------------------
// validarLinea — XOR débito/crédito
// ------------------------------------------------------------

describe('validarLinea — XOR débito/crédito', () => {
  it('acepta línea solo con débito', () => {
    expect(() => validarLinea(LINEA_DEBITO_BOB_1000)).not.toThrow();
  });

  it('acepta línea solo con crédito', () => {
    expect(() => validarLinea(LINEA_CREDITO_BOB_1000)).not.toThrow();
  });

  it('rechaza línea con débito y crédito simultáneamente', () => {
    expect(() =>
      validarLinea({
        ...LINEA_DEBITO_BOB_1000,
        credito: '500.00',
        creditoBob: '500.00',
      }),
    ).toThrow(LineaAmbiguaDebitoCreditoError);
  });

  it('rechaza línea sin débito ni crédito (ambos 0)', () => {
    expect(() =>
      validarLinea({
        ...LINEA_DEBITO_BOB_1000,
        debito: '0',
        credito: '0',
        debitoBob: '0',
        creditoBob: '0',
      }),
    ).toThrow(LineaSinMontoError);
  });
});

// ------------------------------------------------------------
// validarLinea — tipo de cambio
// ------------------------------------------------------------

describe('validarLinea — tipo de cambio', () => {
  it('rechaza tipoCambio = 0', () => {
    expect(() => validarLinea({ ...LINEA_DEBITO_BOB_1000, tipoCambio: '0' })).toThrow(
      TipoCambioInvalidoError,
    );
  });

  it('rechaza tipoCambio negativo', () => {
    expect(() => validarLinea({ ...LINEA_DEBITO_BOB_1000, tipoCambio: '-1' })).toThrow(
      TipoCambioInvalidoError,
    );
  });

  it('rechaza moneda=BOB con tipoCambio ≠ 1', () => {
    expect(() =>
      validarLinea({
        ...LINEA_DEBITO_BOB_1000,
        tipoCambio: '6.96',
      }),
    ).toThrow(TipoCambioInvalidoError);
  });

  it('acepta moneda=USD con tipoCambio válido', () => {
    const linea: LineaParaValidar = {
      orden: 1,
      moneda: Moneda.USD,
      debito: '100.00',
      credito: '0',
      tipoCambio: '6.96',
      debitoBob: '696.00',
      creditoBob: '0',
    };
    expect(() => validarLinea(linea)).not.toThrow();
  });
});

// ------------------------------------------------------------
// validarLinea — coherencia BOB
// ------------------------------------------------------------

describe('validarLinea — coherencia BOB', () => {
  it('acepta debitoBob = debito * tipoCambio exacto', () => {
    const linea: LineaParaValidar = {
      orden: 1,
      moneda: Moneda.USD,
      debito: '100.00',
      credito: '0',
      tipoCambio: '6.96',
      debitoBob: '696.00',
      creditoBob: '0',
    };
    expect(() => validarLinea(linea)).not.toThrow();
  });

  it('acepta diferencia dentro de tolerancia ±0.01', () => {
    // 100 × 6.965 = 696.50; tolerancia permite 696.49 o 696.51.
    const linea: LineaParaValidar = {
      orden: 1,
      moneda: Moneda.USD,
      debito: '100.00',
      credito: '0',
      tipoCambio: '6.965',
      debitoBob: '696.49',
      creditoBob: '0',
    };
    expect(() => validarLinea(linea)).not.toThrow();
  });

  it('rechaza diferencia > 0.01 en debitoBob', () => {
    const linea: LineaParaValidar = {
      orden: 1,
      moneda: Moneda.USD,
      debito: '100.00',
      credito: '0',
      tipoCambio: '6.96',
      debitoBob: '700.00', // esperado 696.00 → diff 4.00 > 0.01
      creditoBob: '0',
    };
    expect(() => validarLinea(linea)).toThrow(MontoBobIncoherenteError);
  });

  it('rechaza creditoBob ≠ 0 cuando la línea es débito', () => {
    const linea: LineaParaValidar = {
      ...LINEA_DEBITO_BOB_1000,
      creditoBob: '100.00',
    };
    expect(() => validarLinea(linea)).toThrow(MontoBobIncoherenteError);
  });
});

// ------------------------------------------------------------
// validarPartidaDoble
// ------------------------------------------------------------

describe('validarPartidaDoble', () => {
  it('acepta débitos = créditos exactos', () => {
    expect(() =>
      validarPartidaDoble([LINEA_DEBITO_BOB_1000, LINEA_CREDITO_BOB_1000]),
    ).not.toThrow();
  });

  it('acepta diff dentro de tolerancia ±0.01', () => {
    expect(() =>
      validarPartidaDoble([
        { ...LINEA_DEBITO_BOB_1000, debito: '1000.00', debitoBob: '1000.00' },
        { ...LINEA_CREDITO_BOB_1000, credito: '999.99', creditoBob: '999.99' },
      ]),
    ).not.toThrow();
  });

  it('rechaza diff > 0.01', () => {
    expect(() =>
      validarPartidaDoble([
        LINEA_DEBITO_BOB_1000,
        { ...LINEA_CREDITO_BOB_1000, credito: '999.00', creditoBob: '999.00' },
      ]),
    ).toThrow(ComprobanteDesbalanceadoError);
  });

  it('exhibe totales y diff en el error', () => {
    try {
      validarPartidaDoble([
        LINEA_DEBITO_BOB_1000,
        { ...LINEA_CREDITO_BOB_1000, creditoBob: '500.00', credito: '500.00' },
      ]);
      fail('debió lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ComprobanteDesbalanceadoError);
      const domainErr = err as ComprobanteDesbalanceadoError;
      expect(domainErr.details).toEqual({
        totalDebitoBob: '1000.00',
        totalCreditoBob: '500.00',
        diffBob: '500.00',
      });
    }
  });
});

// ------------------------------------------------------------
// validarMontoPositivo
// ------------------------------------------------------------

describe('validarMontoPositivo', () => {
  it('acepta totales > 0', () => {
    expect(() =>
      validarMontoPositivo([LINEA_DEBITO_BOB_1000, LINEA_CREDITO_BOB_1000]),
    ).not.toThrow();
  });

  it('rechaza totales = 0 (aunque las líneas existan — edge)', () => {
    const zeroDebito: LineaParaValidar = {
      ...LINEA_DEBITO_BOB_1000,
      debito: '0',
      debitoBob: '0',
    };
    const zeroCredito: LineaParaValidar = {
      ...LINEA_CREDITO_BOB_1000,
      credito: '0',
      creditoBob: '0',
    };
    expect(() => validarMontoPositivo([zeroDebito, zeroCredito])).toThrow(
      ComprobanteMontoCeroError,
    );
  });
});

// ------------------------------------------------------------
// calcularTotalesBob
// ------------------------------------------------------------

describe('calcularTotalesBob', () => {
  it('suma correctamente varios débitos y créditos', () => {
    const lineas: LineaParaValidar[] = [
      { ...LINEA_DEBITO_BOB_1000, debito: '500.50', debitoBob: '500.50' },
      { ...LINEA_DEBITO_BOB_1000, orden: 2, debito: '499.50', debitoBob: '499.50' },
      { ...LINEA_CREDITO_BOB_1000, credito: '1000.00', creditoBob: '1000.00' },
    ];
    const totales = calcularTotalesBob(lineas);
    expect(totales.debito.toBob()).toBe('1000.00');
    expect(totales.credito.toBob()).toBe('1000.00');
  });

  it('retorna ceros si no hay líneas', () => {
    const totales = calcularTotalesBob([]);
    expect(totales.debito.isZero()).toBe(true);
    expect(totales.credito.isZero()).toBe(true);
  });

  it('acepta Prisma.Decimal en el input', () => {
    const totales = calcularTotalesBob([
      {
        ...LINEA_DEBITO_BOB_1000,
        debito: new Prisma.Decimal('250.75'),
        debitoBob: new Prisma.Decimal('250.75'),
      },
    ]);
    expect(totales.debito.toBob()).toBe('250.75');
  });
});

// ------------------------------------------------------------
// validarComprobanteParaContabilizar (integración pura)
// ------------------------------------------------------------

describe('validarComprobanteParaContabilizar', () => {
  const baseInput = {
    glosa: 'Venta al contado a cliente X',
    lineas: [LINEA_DEBITO_BOB_1000, LINEA_CREDITO_BOB_1000],
    fechaContable: HOY,
    hoy: HOY,
  };

  it('acepta un comprobante BOB balanceado válido', () => {
    expect(() => validarComprobanteParaContabilizar(baseInput)).not.toThrow();
  });

  it('acepta un comprobante multi-moneda balanceado en BOB', () => {
    // Pago a proveedor extranjero: crédito USD en caja USD, débito BOB en gasto.
    const lineas: LineaParaValidar[] = [
      // Débito: Gasto (BOB) 696.00
      {
        orden: 1,
        moneda: Moneda.BOB,
        debito: '696.00',
        credito: '0',
        tipoCambio: '1',
        debitoBob: '696.00',
        creditoBob: '0',
      },
      // Crédito: Caja USD 100, tipoCambio 6.96 → 696 BOB
      {
        orden: 2,
        moneda: Moneda.USD,
        debito: '0',
        credito: '100.00',
        tipoCambio: '6.96',
        debitoBob: '0',
        creditoBob: '696.00',
      },
    ];
    expect(() => validarComprobanteParaContabilizar({ ...baseInput, lineas })).not.toThrow();
  });

  it('rechaza glosa vacía antes de otras validaciones', () => {
    expect(() => validarComprobanteParaContabilizar({ ...baseInput, glosa: '' })).toThrow(
      GlosaRequeridaError,
    );
  });

  it('rechaza fecha futura', () => {
    expect(() =>
      validarComprobanteParaContabilizar({
        ...baseInput,
        fechaContable: FechaContable.fromIso('2026-04-23'),
      }),
    ).toThrow(FechaFuturaNoPermitidaError);
  });

  it('rechaza < 2 líneas', () => {
    expect(() =>
      validarComprobanteParaContabilizar({
        ...baseInput,
        lineas: [LINEA_DEBITO_BOB_1000],
      }),
    ).toThrow(ComprobanteSinLineasError);
  });

  it('propaga el error de la línea específica con orden', () => {
    const lineas: LineaParaValidar[] = [
      LINEA_DEBITO_BOB_1000,
      { ...LINEA_CREDITO_BOB_1000, orden: 2, debito: '500.00', debitoBob: '500.00' },
    ];
    try {
      validarComprobanteParaContabilizar({ ...baseInput, lineas });
      fail('debió lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(LineaAmbiguaDebitoCreditoError);
      expect((err as LineaAmbiguaDebitoCreditoError).details).toMatchObject({ orden: 2 });
    }
  });

  it('rechaza partida doble desbalanceada más allá de la tolerancia', () => {
    const lineas: LineaParaValidar[] = [
      LINEA_DEBITO_BOB_1000,
      { ...LINEA_CREDITO_BOB_1000, credito: '900.00', creditoBob: '900.00' },
    ];
    expect(() => validarComprobanteParaContabilizar({ ...baseInput, lineas })).toThrow(
      ComprobanteDesbalanceadoError,
    );
  });
});
