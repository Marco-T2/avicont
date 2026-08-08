import { EstadoComprobante, Moneda, Prisma, TipoComprobante } from '@prisma/client';

import { toComprobanteResponse } from './comprobante-response.dto';

import type { ComprobanteConLineas } from '../ports/comprobante.repository.port';

function linea(
  overrides: Partial<ComprobanteConLineas['lineas'][number]> = {},
): ComprobanteConLineas['lineas'][number] {
  return {
    id: 'lin-1',
    organizationId: 'org-1',
    comprobanteId: 'comp-1',
    orden: 1,
    cuentaId: 'cta-1',
    contactoId: null,
    moneda: Moneda.BOB,
    debito: new Prisma.Decimal('1000.00'),
    credito: new Prisma.Decimal('0'),
    tipoCambio: new Prisma.Decimal('1'),
    debitoBob: new Prisma.Decimal('1000.00'),
    creditoBob: new Prisma.Decimal('0'),
    glosaLinea: null,
    ...overrides,
  } as ComprobanteConLineas['lineas'][number];
}

function comprobante(overrides: Partial<ComprobanteConLineas> = {}): ComprobanteConLineas {
  return {
    id: 'comp-1',
    organizationId: 'org-1',
    tipo: TipoComprobante.DIARIO,
    numero: 'D2604-000042',
    estado: EstadoComprobante.CONTABILIZADO,
    fechaContable: new Date('2026-04-22T00:00:00.000Z'),
    periodoFiscalId: 'per-1',
    glosa: 'Glosa de prueba',
    monedaPrincipal: Moneda.BOB,
    tipoCambioReexpresion: new Prisma.Decimal('1'),
    totalDebitoBob: new Prisma.Decimal('1000.00'),
    totalCreditoBob: new Prisma.Decimal('1000.00'),
    origenTipo: null,
    origenId: null,
    generadoPorSistema: false,
    anulado: false,
    fechaAnulacion: null,
    anuladoPorUserId: null,
    motivoAnulacion: null,
    createdAt: new Date('2026-04-22T10:00:00.000Z'),
    createdByUserId: 'user-1',
    updatedAt: new Date('2026-04-22T10:00:00.000Z'),
    lineas: [linea()],
    ...overrides,
  } as ComprobanteConLineas;
}

describe('toComprobanteResponse — serialización de montos (§4.5)', () => {
  // Regresión. Las LÍNEAS salían con `Decimal.toString()`, que descarta el cero
  // final: un importe de 1000.00 viajaba como "1000" y la UI lo muestra crudo,
  // así que se leía "Bs 1000" en una columna de dinero. La CABECERA del mismo
  // archivo ya usaba `toFixed(2)`, o sea que el mismo comprobante publicaba el
  // total con dos decimales y sus líneas sin ellos. El `@ApiProperty` de
  // `debitoBob` documenta `example: '1000.00'`, así que el DTO también se
  // contradecía a sí mismo.
  it('un monto redondo conserva sus 2 decimales en las líneas: "1000.00", nunca "1000"', () => {
    const res = toComprobanteResponse(comprobante());

    expect(res.lineas[0]?.debitoBob).toBe('1000.00');
    expect(res.lineas[0]?.debito).toBe('1000.00');
    // El lado en cero también: "0.00", no "0".
    expect(res.lineas[0]?.creditoBob).toBe('0.00');
    expect(res.lineas[0]?.credito).toBe('0.00');
  });

  it('la cabecera y sus líneas publican el MISMO importe con el mismo formato', () => {
    const res = toComprobanteResponse(comprobante());

    expect(res.totalDebitoBob).toBe(res.lineas[0]?.debitoBob);
  });

  // El gemelo del primero, y la razón por la que este archivo existe: sin él,
  // "arreglar" el bug aplicando `toFixed(2)` a TODA la línea pasaría en verde
  // mientras destruye el tipo de cambio. `tipoCambio` es Decimal(14,8) y NO es
  // dinero: un 0.14285714 truncado a "0.14" es otro número, y encima uno que
  // descuadra la reexpresión a BOB sin que nada falle.
  it('tipoCambio NO se recorta a 2 decimales: conserva su escala de 8', () => {
    const res = toComprobanteResponse(
      comprobante({
        lineas: [linea({ tipoCambio: new Prisma.Decimal('0.14285714') })],
      }),
    );

    expect(res.lineas[0]?.tipoCambio).toBe('0.14285714');
  });

  it('un monto en moneda original con más de 2 decimales no puede existir, pero el redondeo es half-up si llegara', () => {
    // Defensa: la columna es Decimal(18,2), así que Postgres ya redondea al
    // insertar. Este caso fija que el DTO use la MISMA política (half-up) y no
    // una distinta, para que formatear no cambie el número respecto de la BD.
    const res = toComprobanteResponse(
      comprobante({ lineas: [linea({ debitoBob: new Prisma.Decimal('31.525') })] }),
    );

    expect(res.lineas[0]?.debitoBob).toBe('31.53');
  });
});
