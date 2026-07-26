/**
 * La IDENTIDAD del informe de conciliación bancaria (REQ-ICB-01/02/06/07),
 * pura y sin I/O — mismo molde que `continuidad-extractos.ts`.
 *
 * El informe es un puente entre dos observaciones INDEPENDIENTES del mismo
 * dinero: el saldo que publica el banco (extractos importados) y el saldo
 * contable (comprobantes cargados por otra vía). No cuadran por construcción;
 * el informe no "arregla" la diferencia — la explica partida por partida hasta
 * que la aritmética cierre sola:
 *
 *     saldoExtracto + pendientes + ignorados + enTransito + arranque + residuo
 *       = saldoLibros
 *
 * donde cada partida es la contribución FIRMADA para llegar del extracto a los
 * libros, sobre saldos ACUMULADOS al corte (nunca flujos del período, D3 /
 * REQ-ICB-01) y acotada a la ventana `arranque.fecha < fecha ≤ corte` — todo
 * lo anterior al arranque ya está absorbido en los saldos declarados.
 *
 * La clasificación es RELATIVA AL CORTE, no al estado global de hoy:
 * - Un movimiento CONCILIADO cuyo asiento tiene `fechaContable > corte` sigue
 *   siendo partida EN ese corte — el banco lo registró y los libros, AL CORTE,
 *   no. Es exactamente el cargo del 31/07 asentado el 15/08 (REQ-ICB-01), y
 *   cuando julio está CERRADO esa diferencia es PERMANENTE en ese corte: se
 *   señala con `asentadoEl` y jamás se trata como error (REQ-ICB-07).
 * - Simétrico para una línea conciliada con un movimiento posterior al corte
 *   (el cheque emitido en julio y cobrado en agosto): al corte sigue en
 *   tránsito, señalada con `registradoPorBancoEl`.
 * - Un par conciliado con AMBAS patas ≤ corte se cancela solo y no es partida.
 *
 * Dos reglas de honestidad que esta función se niega a violar:
 * - `IGNORADO` es partida CON NOMBRE PROPIO (REQ-ICB-02): es un movimiento
 *   real, dentro del saldo publicado, que no tendrá contrapartida NUNCA por
 *   decisión del usuario. Omitirlo rompe la identidad sobre datos correctos;
 *   absorberlo la hace cerrar mintiendo.
 * - El residuo se EXPONE, jamás se absorbe ni se distribuye (REQ-ICB-06): un
 *   residuo ≠ 0 significa que algo toca la cuenta banco fuera del universo
 *   conocido por el módulo, y esa señal es el valor del instrumento. Con
 *   `saldoExtracto` nulo el residuo es nulo: sin dato no hay veredicto, la
 *   misma regla que `SIN_VERIFICAR` (REQ-ICB-03/05).
 *
 * El caller (service, task 3.6) deriva `estadoEfectivo` con
 * `domain/estado-efectivo.ts` — el MISMO código que el workspace (D4) — y
 * garantiza que todos los montos vienen en la MISMA moneda (v1: BOB,
 * `CONCILIACION_MONEDA_NO_SOPORTADA` antes de llegar acá).
 */
import { Money } from '@/common/domain/money';

import type { FechaContable } from '@/common/domain/fecha-contable';
import type { LadoBancario, LadoContable } from '@prisma/client';

import type { EstadoEfectivoLinea, EstadoEfectivoMovimiento } from './estado-efectivo';

// ============================================================
// Insumos — datos ya cargados y clasificados por el caller
// ============================================================

interface MovimientoInformeBase {
  readonly id: string;
  /** Fecha REAL del movimiento según el banco (§4.6 — calendario puro). */
  readonly fecha: FechaContable;
  /** SIEMPRE positivo (schema); la dirección la lleva `tipo`. */
  readonly monto: Money;
  /** Perspectiva del banco: CREDITO entra a la cuenta, DEBITO sale. */
  readonly tipo: LadoBancario;
}

/**
 * `fechaAsientoVinculado` solo existe (y es obligatoria) cuando el movimiento
 * está CONCILIADO: es la `fechaContable` de la línea que lo reclama, y decide
 * si el par se cancela al corte o sigue siendo partida (REQ-ICB-07).
 */
export type MovimientoParaInforme =
  | (MovimientoInformeBase & {
      readonly estadoEfectivo: Exclude<EstadoEfectivoMovimiento, 'CONCILIADO'>;
    })
  | (MovimientoInformeBase & {
      readonly estadoEfectivo: 'CONCILIADO';
      readonly fechaAsientoVinculado: FechaContable;
    });

interface LineaInformeBase {
  readonly comprobanteId: string;
  readonly orden: number;
  readonly fecha: FechaContable;
  /** SIEMPRE positivo (débito XOR crédito, §4.1); la dirección la lleva `tipo`. */
  readonly monto: Money;
  /** Perspectiva de libros: DEBITO aumenta el activo banco, CREDITO lo baja. */
  readonly tipo: LadoContable;
}

/** `fechaMovimientoVinculado`: fecha del movimiento bancario que la reclama. */
export type LineaParaInforme =
  | (LineaInformeBase & { readonly estadoEfectivo: Exclude<EstadoEfectivoLinea, 'CONCILIADO'> })
  | (LineaInformeBase & {
      readonly estadoEfectivo: 'CONCILIADO';
      readonly fechaMovimientoVinculado: FechaContable;
    });

export interface ArranqueParaInforme {
  readonly fecha: FechaContable;
  /**
   * Diferencia ACEPTADA al declarar el arranque: la parte que el usuario asume
   * como INEXPLICABLE (REQ-ICB-04 la declara como cuarto dato, junto a la fecha
   * y a los dos saldos). NO se calcula como `saldoExtracto − saldoLibros`: esa
   * resta incluye las partidas en tránsito abiertas a esa fecha, que se
   * resuelven solas cuando la otra pata llega — congelarlas acá las volvería a
   * cobrar y produciría un residuo fantasma en el primer corte de cada cuenta
   * recién adoptada.
   *
   * CONVENCIÓN DE SIGNO (fijada acá, el resto del change la sigue): positiva
   * cuando el extracto queda por encima de los libros. Su contribución al
   * puente extracto→libros es por lo tanto `−residual`.
   */
  readonly diferenciaResidual: Money;
}

export interface InsumosInforme {
  readonly corte: FechaContable;
  /** La declaración vigente al corte (`vigenteA`). Sin arranque no hay identidad. */
  readonly arranque: ArranqueParaInforme;
  /** Saldo del último movimiento ≤ corte. `null` honesto ⇒ sin veredicto. */
  readonly saldoExtracto: Money | null;
  /** Acumulado de libros ≤ corte (CONTABILIZADO/BLOQUEADO, no anulados). */
  readonly saldoLibros: Money;
  readonly movimientos: readonly MovimientoParaInforme[];
  readonly lineas: readonly LineaParaInforme[];
}

// ============================================================
// El informe — cada importe es contribución FIRMADA extracto→libros
// ============================================================

export interface DetalleMovimientoPendiente {
  readonly movimientoId: string;
  readonly fecha: FechaContable;
  readonly importe: Money;
  /**
   * No-nulo ⇒ el asiento EXISTE pero es posterior al corte: la diferencia de
   * ESTE corte no se resolverá nunca en él (REQ-ICB-07) — se señala, no se
   * degrada ni se trata como error.
   */
  readonly asentadoEl: FechaContable | null;
}

export interface DetalleMovimientoIgnorado {
  readonly movimientoId: string;
  readonly fecha: FechaContable;
  readonly importe: Money;
}

export interface DetalleLineaEnTransito {
  readonly comprobanteId: string;
  readonly orden: number;
  readonly fecha: FechaContable;
  readonly importe: Money;
  /** No-nulo ⇒ el banco lo registró, pero después del corte (simétrico de `asentadoEl`). */
  readonly registradoPorBancoEl: FechaContable | null;
}

export interface PartidaInforme<TDetalle> {
  /** Suma firmada del detalle. */
  readonly importe: Money;
  readonly detalle: readonly TDetalle[];
}

export interface InformeConciliacion {
  readonly corte: FechaContable;
  readonly saldoExtracto: Money | null;
  readonly saldoLibros: Money;
  readonly partidas: {
    /** El banco lo registró; los libros, AL CORTE, no (signo −). */
    readonly pendientes: PartidaInforme<DetalleMovimientoPendiente>;
    /** El banco lo registró y los libros NUNCA lo harán — nombre propio (signo −). */
    readonly ignorados: PartidaInforme<DetalleMovimientoIgnorado>;
    /** Los libros lo registraron; el banco, AL CORTE, no (signo +). */
    readonly enTransito: PartidaInforme<DetalleLineaEnTransito>;
    /** Residuo declarado al fijar el punto de partida, nombrado con su fecha (signo ±). */
    readonly arranque: { readonly fecha: FechaContable; readonly importe: Money };
  };
  /**
   * Lo que las partidas NO explican. `null` cuando `saldoExtracto` es nulo:
   * sin dato no hay veredicto. NUNCA se ajusta ni se reparte (REQ-ICB-06).
   */
  readonly residuo: Money | null;
}

// ============================================================
// Armado
// ============================================================

function negar(monto: Money): Money {
  return Money.ZERO.minus(monto);
}

function sumarImportes(detalles: readonly { importe: Money }[]): Money {
  return detalles.reduce((total, d) => total.plus(d.importe), Money.ZERO);
}

export function armarInforme(insumos: InsumosInforme): InformeConciliacion {
  const { corte, arranque, saldoExtracto, saldoLibros } = insumos;

  // `vigenteA` garantiza `fecha ≤ corte`; si el caller rompe ese contrato la
  // ventana queda invertida y la identidad no significa nada. Error de
  // programación, no condición de dominio — mismo criterio que los VOs.
  if (arranque.fecha.isAfter(corte)) {
    throw new RangeError(
      `armarInforme: corte (${corte.toIso()}) anterior al arranque (${arranque.fecha.toIso()})`,
    );
  }

  const enVentana = (fecha: FechaContable): boolean =>
    fecha.isAfter(arranque.fecha) && !fecha.isAfter(corte);

  const pendientes: DetalleMovimientoPendiente[] = [];
  const ignorados: DetalleMovimientoIgnorado[] = [];
  for (const mov of insumos.movimientos) {
    if (!enVentana(mov.fecha)) continue;
    // Un CREDITO bancario ya está dentro del extracto y falta en libros: para
    // llegar a libros se RESTA. El DEBITO, al revés.
    const importe = mov.tipo === 'CREDITO' ? negar(mov.monto) : mov.monto;

    if (mov.estadoEfectivo === 'CONCILIADO') {
      // Con el asiento ≤ corte, ambas patas están en ambos saldos: se
      // cancelan solas y no son partida. Con el asiento DESPUÉS del corte,
      // al corte sigue siendo diferencia — y si su período está cerrado,
      // lo será siempre (REQ-ICB-07).
      if (mov.fechaAsientoVinculado.isAfter(corte)) {
        pendientes.push({
          movimientoId: mov.id,
          fecha: mov.fecha,
          importe,
          asentadoEl: mov.fechaAsientoVinculado,
        });
      }
    } else if (mov.estadoEfectivo === 'IGNORADO') {
      ignorados.push({ movimientoId: mov.id, fecha: mov.fecha, importe });
    } else {
      pendientes.push({ movimientoId: mov.id, fecha: mov.fecha, importe, asentadoEl: null });
    }
  }

  const enTransito: DetalleLineaEnTransito[] = [];
  for (const linea of insumos.lineas) {
    if (!enVentana(linea.fecha)) continue;
    // Un DEBITO contable ya está dentro de libros y falta en el extracto:
    // para llegar a libros se SUMA. El CREDITO, al revés.
    const importe = linea.tipo === 'DEBITO' ? linea.monto : negar(linea.monto);

    if (linea.estadoEfectivo === 'CONCILIADO') {
      if (linea.fechaMovimientoVinculado.isAfter(corte)) {
        enTransito.push({
          comprobanteId: linea.comprobanteId,
          orden: linea.orden,
          fecha: linea.fecha,
          importe,
          registradoPorBancoEl: linea.fechaMovimientoVinculado,
        });
      }
    } else {
      enTransito.push({
        comprobanteId: linea.comprobanteId,
        orden: linea.orden,
        fecha: linea.fecha,
        importe,
        registradoPorBancoEl: null,
      });
    }
  }

  const partidas = {
    pendientes: { importe: sumarImportes(pendientes), detalle: pendientes },
    ignorados: { importe: sumarImportes(ignorados), detalle: ignorados },
    enTransito: { importe: sumarImportes(enTransito), detalle: enTransito },
    arranque: { fecha: arranque.fecha, importe: negar(arranque.diferenciaResidual) },
  };

  // residuo = saldoLibros − saldoExtracto − Σ partidas. Aritmética EXACTA
  // (Money/decimal): lo que no cierre —incluso Bs 0.01 de polvo de matches
  // tolerados— se muestra tal cual es.
  const residuo =
    saldoExtracto === null
      ? null
      : saldoLibros
          .minus(saldoExtracto)
          .minus(partidas.pendientes.importe)
          .minus(partidas.ignorados.importe)
          .minus(partidas.enTransito.importe)
          .minus(partidas.arranque.importe);

  return { corte, saldoExtracto, saldoLibros, partidas, residuo };
}
