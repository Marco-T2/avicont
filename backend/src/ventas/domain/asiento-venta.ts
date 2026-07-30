/**
 * Builder del asiento de una venta (REQ-VTA-04) — dominio puro.
 *
 * Recibe datos YA resueltos (snapshots de `LineaVenta`, cuenta destino elegida,
 * concepto CxC, `montoTotal` calculado por `calculo-venta`) y devuelve las
 * `LineaSistemaData[]` que consume `ComprobanteSistemaWriterPort`. No consulta
 * cuentas, no abre transacciones, no conoce Prisma más allá de los tipos.
 *
 * | Condición | Asiento |
 * |---|---|
 * | CONTADO | Debe cuenta destino ELEGIDA / Haber cuenta de ingreso por línea |
 * | CREDITO | Debe CxC (`cuentasPorCobrarId`) / Haber cuenta de ingreso por línea |
 *
 * La glosa de CABECERA no se compone acá: es responsabilidad del service, y
 * DEBE cumplir Q-2 (autosuficiente en el Libro Diario — identifica operación y
 * cliente sin abrir la venta; `"Venta #42"` NO cumple). Este builder solo emite
 * `glosaLinea` por línea de haber, propagando la `descripcion` snapshot.
 */

import type { CondicionPago } from '@prisma/client';

import { Money } from '@/common/domain/money';
import { DomainError, InvalidStateError } from '@/common/errors';
import type { LineaSistemaData } from '@/comprobantes/ports/comprobante-sistema-writer.port';

// ============================================================
// Entrada
// ============================================================

/** Proyección de `LineaVenta` que necesita el asiento — SOLO snapshots (D-28). */
export interface LineaVentaParaAsiento {
  /**
   * Snapshot resuelto al CREAR la línea (REQ-VTA-02). La regeneración (D-17)
   * lee este valor persistido — NUNCA re-resuelve el catálogo vigente.
   */
  cuentaIngresoId: string;
  /** Ya redondeado a moneda por `redondearABob()` (REQ-VTA-03, task 4.1). */
  subtotal: Money;
  /** Snapshot al momento de vender; va como `glosaLinea` del haber. */
  descripcion: string;
}

interface BaseVentaParaAsiento {
  /** Cliente de la cabecera (REQ-VTA-02, obligatorio). */
  contactoId: string;
  /** Σ exacta de subtotales ya redondeados, calculada por el backend (B-8/B-9). */
  montoTotal: Money;
  lineas: LineaVentaParaAsiento[];
}

/**
 * `Extract` sobre el enum Prisma y no literales sueltos: si `CondicionPago`
 * renombra un valor, el discriminante colapsa a `never` y esto deja de compilar.
 */
export interface VentaContadoParaAsiento extends BaseVentaParaAsiento {
  condicionPago: Extract<CondicionPago, 'CONTADO'>;
  /**
   * Cuenta destino ELEGIDA por el usuario (PA-1), jamás una constante: el
   * default Caja General es precarga de UI. La elegibilidad (REQ-CXC-02) la
   * valida el service ANTES de llegar acá.
   */
  cuentaDestinoId: string;
}

export interface VentaCreditoParaAsiento extends BaseVentaParaAsiento {
  condicionPago: Extract<CondicionPago, 'CREDITO'>;
  /** Concepto `cuentasPorCobrarId` de `OrgConfiguracionContable` (REQ-VTA-10). */
  cuentasPorCobrarId: string;
}

/**
 * Unión discriminada a propósito: una venta CONTADO no puede ni NOMBRAR la
 * cuenta CxC (D-04 por construcción, no por disciplina) y una CREDITO no
 * lleva cuenta destino.
 */
export type VentaParaAsiento = VentaContadoParaAsiento | VentaCreditoParaAsiento;

// ============================================================
// Errores — bugs de dominio y datos imposibles
// ============================================================

/**
 * `montoTotal` ≠ Σ subtotales. Ambos los calcula el backend (REQ-VTA-03), así
 * que un descuadre acá es un bug del caller, no un error del usuario. El
 * chequeo es EXACTO: la tolerancia ±Bs 0.01 de §4.1 es del core para partida
 * doble multi-moneda, no una licencia para descuadrar la generación.
 * Code: VENTA_ASIENTO_DESCUADRADO — 500.
 */
export class VentaAsientoDescuadradoError extends DomainError {
  readonly httpStatus = 500;

  constructor(montoTotalBob: string, sumaSubtotalesBob: string) {
    super(
      'VENTA_ASIENTO_DESCUADRADO',
      'El montoTotal de la venta no coincide con la suma de sus subtotales (bug de dominio)',
      { montoTotalBob, sumaSubtotalesBob },
    );
  }
}

/**
 * §4.1: un comprobante contabilizado exige suma total > 0. Una venta cuyo
 * asiento movería Bs 0 no tiene asiento que emitir.
 * Code: VENTA_ASIENTO_SIN_MONTO — 422.
 */
export class VentaAsientoSinMontoError extends InvalidStateError {
  constructor() {
    super('VENTA_ASIENTO_SIN_MONTO', 'La venta no mueve ningún monto; no hay asiento que generar');
  }
}

/**
 * §4.1: débitos y créditos ≥ 0. `cantidad` y `precioUnitario` no negativos no
 * pueden producir esto — si llega, el bug está aguas arriba del builder.
 * Code: VENTA_LINEA_SUBTOTAL_NEGATIVO — 500.
 */
export class VentaLineaSubtotalNegativoError extends DomainError {
  readonly httpStatus = 500;

  constructor(cuentaIngresoId: string, subtotalBob: string) {
    super(
      'VENTA_LINEA_SUBTOTAL_NEGATIVO',
      'Una línea de venta tiene subtotal negativo (bug de dominio)',
      { cuentaIngresoId, subtotalBob },
    );
  }
}

// ============================================================
// Builder
// ============================================================

const MONEDA_BOB = 'BOB' satisfies LineaSistemaData['moneda'];
const DECIMAL_CERO = Money.ZERO.toPrismaDecimal();
// D-10: piloto íntegro en BOB — tipoCambio fijo 1, debitoBob espejo de debito.
const TIPO_CAMBIO_BOB = Money.of('1').toPrismaDecimal();

function lineaDebe(cuentaId: string, contactoId: string, monto: Money): LineaSistemaData {
  const decimal = monto.toPrismaDecimal();
  return {
    cuentaId,
    contactoId,
    moneda: MONEDA_BOB,
    debito: decimal,
    credito: DECIMAL_CERO,
    tipoCambio: TIPO_CAMBIO_BOB,
    debitoBob: decimal,
    creditoBob: DECIMAL_CERO,
    glosaLinea: null,
  };
}

function lineaHaber(linea: LineaVentaParaAsiento): LineaSistemaData {
  const decimal = linea.subtotal.toPrismaDecimal();
  return {
    cuentaId: linea.cuentaIngresoId,
    contactoId: null,
    moneda: MONEDA_BOB,
    debito: DECIMAL_CERO,
    credito: decimal,
    tipoCambio: TIPO_CAMBIO_BOB,
    debitoBob: DECIMAL_CERO,
    creditoBob: decimal,
    glosaLinea: linea.descripcion,
  };
}

/**
 * Arma las líneas del asiento de la venta. Débito primero (el writer asigna
 * `orden` por posición y la convención contable presenta el debe arriba).
 *
 * ## Decisión: una línea de haber POR CADA línea de venta, sin agregar por cuenta
 *
 * Dos líneas que comparten `cuentaIngresoId` emiten dos haberes. Agregar
 * ahorraría filas pero le quita al contador el desglose en el Libro Mayor:
 * cada haber conserva su monto y su `descripcion` snapshot como `glosaLinea`,
 * así "qué concepto produjo este ingreso" se responde desde el Mayor sin abrir
 * la venta. Además el 1:1 con `LineaVenta` hace la regeneración (D-17)
 * trivialmente comparable línea a línea. Costo: más filas — sin necesidad
 * medida de optimizarlo (§2.4).
 *
 * ## Decisión: la línea de débito lleva `contactoId` también en CONTADO
 *
 * B-1 solo lo OBLIGA en la línea CxC, pero el writer nunca lo prohíbe: exige
 * presencia donde `requiereContacto` y acepta el dato en cualquier línea. La
 * venta siempre tiene cliente (REQ-VTA-02), así que propagarlo (a) elimina la
 * clase de fallo runtime "cuenta destino marcada `requiereContacto` después"
 * y (b) deja documentado en el Mayor de Caja/Bancos quién pagó. No crea
 * partida abierta ni toca CxC (D-04): el estado de cuenta deriva de las líneas
 * de la cuenta CxC, no de cualquier línea con contacto.
 */
export function construirAsientoVenta(venta: VentaParaAsiento): LineaSistemaData[] {
  venta.lineas.forEach((l) => {
    if (l.subtotal.isNegative()) {
      throw new VentaLineaSubtotalNegativoError(l.cuentaIngresoId, l.subtotal.toBob());
    }
  });

  const sumaSubtotales = venta.lineas.reduce((acc, l) => acc.plus(l.subtotal), Money.ZERO);
  if (!venta.montoTotal.equals(sumaSubtotales)) {
    throw new VentaAsientoDescuadradoError(venta.montoTotal.toBob(), sumaSubtotales.toBob());
  }

  // §4.1: suma total > 0 — sin monto no hay asiento válido que emitir.
  if (!venta.montoTotal.isPositive()) {
    throw new VentaAsientoSinMontoError();
  }

  const cuentaDebeId =
    venta.condicionPago === 'CONTADO' ? venta.cuentaDestinoId : venta.cuentasPorCobrarId;

  // §4.1: una línea tiene débito O crédito, nunca ninguno — un subtotal 0
  // (ítem bonificado) queda en el documento pero no emite línea contable.
  // Mismo criterio SKIP-on-zero del cierre de ejercicio.
  const haberes = venta.lineas.filter((l) => l.subtotal.isPositive()).map(lineaHaber);

  return [lineaDebe(cuentaDebeId, venta.contactoId, venta.montoTotal), ...haberes];
}
