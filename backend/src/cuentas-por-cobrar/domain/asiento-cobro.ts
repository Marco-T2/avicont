/**
 * Builder del asiento de un cobro (REQ-CXC-02) — dominio puro.
 *
 * El asiento es SIEMPRE el mismo, se aplique a lo que se aplique (las
 * aplicaciones NO generan asiento — D-03):
 *
 * ```
 * Debe  <cuenta destino>   monto
 * Haber CxC                monto      ← con contactoId del cobro (B-1)
 * ```
 *
 * Recibe datos YA resueltos (cuenta destino validada como elegible, concepto
 * `cuentasPorCobrarId` de `OrgConfiguracionContable`) y devuelve las
 * `LineaSistemaData[]` que consume `ComprobanteSistemaWriterPort`. Su
 * comprobante es de tipo `INGRESO` con `origenTipo = 'COBRO'` (D-11) — eso lo
 * arma el service; acá solo las líneas.
 *
 * La glosa de CABECERA no se compone acá: es responsabilidad del service vía
 * `componerGlosaComprobanteCobro` (Q-2).
 */

import { Money } from '@/common/domain/money';
import { InvalidStateError } from '@/common/errors';
import type { LineaSistemaData } from '@/comprobantes/ports/comprobante-sistema-writer.port';

// ============================================================
// Entrada
// ============================================================

/**
 * Proyección del `Cobro` que el asiento necesita. `contactoId` es `string`
 * NO-nullable a propósito (lección Fase 4: lo que puede garantizar el sistema
 * de tipos no se deja a un test): la línea Haber CxC sin contacto falla en
 * runtime (`1.1.2.001` tiene `requiereContacto: true`, B-1) — con este tipo,
 * emitirla sin contacto NO COMPILA.
 */
export interface CobroParaAsiento {
  contactoId: string;
  monto: Money;
  /** Cuenta destino ELEGIDA por el usuario, ya validada elegible (REQ-CXC-02). */
  cuentaDestinoId: string;
  /** Concepto `cuentasPorCobrarId` de `OrgConfiguracionContable` (B-12). */
  cuentasPorCobrarId: string;
}

// ============================================================
// Errores — junto a la regla que los produce (molde: VENTA_ASIENTO_*)
// ============================================================

/**
 * §4.1: un comprobante contabilizado exige suma total > 0 y débitos/créditos
 * ≥ 0. Un cobro de Bs 0 no tiene asiento que emitir; uno negativo no existe
 * como hecho contable — ambos colapsan acá (aguas arriba el DTO ya exige
 * monto > 0; este es el guard de dominio).
 * Code: COBRO_ASIENTO_SIN_MONTO — 422.
 */
export class CobroAsientoSinMontoError extends InvalidStateError {
  constructor(montoBob: string) {
    super(
      'COBRO_ASIENTO_SIN_MONTO',
      'El cobro no mueve un monto positivo; no hay asiento que generar',
      { montoBob },
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

function lineaHaber(cuentaId: string, contactoId: string, monto: Money): LineaSistemaData {
  const decimal = monto.toPrismaDecimal();
  return {
    cuentaId,
    contactoId,
    moneda: MONEDA_BOB,
    debito: DECIMAL_CERO,
    credito: decimal,
    tipoCambio: TIPO_CAMBIO_BOB,
    debitoBob: DECIMAL_CERO,
    creditoBob: decimal,
    glosaLinea: null,
  };
}

/**
 * Arma las dos líneas del asiento del cobro. Débito primero (el writer asigna
 * `orden` por posición y la convención contable presenta el debe arriba).
 *
 * ## Decisión: la línea de débito también lleva `contactoId`
 *
 * B-1 solo lo OBLIGA en la línea CxC, pero el cobro siempre tiene cliente:
 * propagarlo al débito (a) elimina la clase de fallo runtime "cuenta destino
 * marcada `requiereContacto` después" y (b) deja documentado en el Mayor de
 * Caja/Bancos quién pagó. Misma decisión que el asiento de la venta CONTADO.
 *
 * ## Decisión: `glosaLinea` null en ambas líneas
 *
 * El cobro no tiene detalle por línea (no hay ítems): la glosa de cabecera
 * (Q-2, autosuficiente) es la única narrativa y duplicarla por línea solo
 * ensuciaría el Mayor.
 */
export function construirAsientoCobro(cobro: CobroParaAsiento): LineaSistemaData[] {
  // §4.1: suma total > 0 — sin monto positivo no hay asiento válido que emitir.
  if (!cobro.monto.isPositive()) {
    throw new CobroAsientoSinMontoError(cobro.monto.toBob());
  }

  return [
    lineaDebe(cobro.cuentaDestinoId, cobro.contactoId, cobro.monto),
    // B-1: el Haber CxC DEBE llevar el contacto — es la línea de la que
    // deriva el estado de cuenta del cliente (REQ-CXC-07).
    lineaHaber(cobro.cuentasPorCobrarId, cobro.contactoId, cobro.monto),
  ];
}
