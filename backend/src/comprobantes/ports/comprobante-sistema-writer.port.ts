// Writer port DEFINIDO y POSEÍDO por `comprobantes` (§3.7 CLAUDE.md): los módulos
// comerciales (`ventas`, `cuentas-por-cobrar`) lo consumen para generar y mantener
// SUS comprobantes por el PATH-SISTEMA, distinto del flujo de usuario.
//
// ## Por qué un port nuevo y no `CierreComprobanteWriterPort`
//
// El writer del cierre **no valida nada** —escribe Prisma directo y hardcodea
// `contactoId: null`— porque sus asientos los arma el propio módulo de cierre a
// partir de saldos ya cuadrados. Ventas necesita lo contrario: líneas CON
// `contactoId` (el campo del que depende el aging de cartera) y re-validación
// completa. Extender el port del cierre obligaría a meterle validación a un
// camino que hoy deliberadamente no la tiene.
//
// ## Por qué RE-VALIDA (REQ-CMP-VTA-03, §4.2 defense in depth)
//
// Este camino esquiva la guarda de `generadoPorSistema` que bloquea al usuario.
// Un writer que esquiva la guarda **sin re-validar** produce asientos
// desbalanceados o contra cuentas desactivadas: el caso es real, porque
// `cuentaIngresoId` es configuración almacenada y la cuenta puede desactivarse
// después de configurada. Por eso todo método que escriba líneas aplica los
// invariantes de §4.1 antes de persistir.

import type { Moneda, Prisma, TipoComprobante } from '@prisma/client';

export const COMPROBANTE_SISTEMA_WRITER_PORT = Symbol('COMPROBANTE_SISTEMA_WRITER_PORT');

// ============================================================
// Orígenes comerciales (tasks.md 2.9)
// ============================================================

/**
 * `origenTipo` del comprobante que genera una venta (tipo `VENTA`).
 *
 * `origenTipo` es un `String?` libre en el schema, comparado en varios lugares:
 * un typo no rompe nada, devuelve `false` en silencio (Anti-09). El propio
 * comentario-contrato del schema ya exige usarlos SIEMPRE vía constante de
 * dominio; el cierre lo cumple con su `CierreOrigenTipo` y acá se cumple igual.
 */
export const ORIGEN_TIPO_VENTA = 'VENTA';

/**
 * `origenTipo` del comprobante que genera un cobro.
 *
 * OJO: el comprobante de un cobro es de tipo **`INGRESO`**, no `VENTA` (D-11).
 * El tipo NO identifica al cobro — el origen sí. Por eso el listado distingue
 * cobro de venta mirando `origenTipo`, nunca `tipo`.
 */
export const ORIGEN_TIPO_COBRO = 'COBRO';

export type OrigenTipoComercial = typeof ORIGEN_TIPO_VENTA | typeof ORIGEN_TIPO_COBRO;

/**
 * Los orígenes que pertenecen a un módulo comercial. Se declara con la unión
 * como tipo del array (no `string[]`) para que sumar un origen nuevo a
 * `OrigenTipoComercial` y olvidarlo acá NO compile.
 */
export const ORIGENES_COMERCIALES: readonly OrigenTipoComercial[] = [
  ORIGEN_TIPO_VENTA,
  ORIGEN_TIPO_COBRO,
];

/**
 * ¿El comprobante lo generó un módulo comercial?
 *
 * Lo consume la guarda de `anular` del camino de usuario (REQ-CMP-VTA-04): la
 * anulación de estos comprobantes se dispara desde ventas/cobros, que primero
 * desvinculan las aplicaciones. Anularlo "por abajo" dejaría la venta viva
 * apuntando a un asiento anulado.
 */
export function esOrigenComercial(origenTipo: string | null | undefined): boolean {
  if (origenTipo === null || origenTipo === undefined) return false;
  return (ORIGENES_COMERCIALES as readonly string[]).includes(origenTipo);
}

/**
 * Cómo se nombra el documento origen en un mensaje al usuario.
 *
 * El contador no sabe qué es un `origenTipo`: lo que necesita leer es "esto
 * lo generó la venta, andá a la venta". La unión va como CLAVE del `Record`
 * —no como valor— para que sumar un origen comercial y olvidarlo acá NO
 * compile; con la unión del lado del valor, la omisión pasa en verde. Este
 * repo ya se quemó con esa dirección al sumar perfiles de extracto.
 */
const NOMBRE_POR_ORIGEN: Record<OrigenTipoComercial, string> = {
  [ORIGEN_TIPO_VENTA]: 'la venta',
  [ORIGEN_TIPO_COBRO]: 'el cobro',
};

export function nombreDeOrigenComercial(origenTipo: OrigenTipoComercial): string {
  return NOMBRE_POR_ORIGEN[origenTipo];
}

// ============================================================
// Datos de escritura
// ============================================================

/**
 * Línea tal como la emite un generador comercial.
 *
 * Sin `orden`: lo asigna el writer por posición del array (1-based). El caller
 * arma el asiento, no lleva la contabilidad de los índices.
 *
 * Los montos son `Prisma.Decimal` y no `number` (§4.5). El generador los
 * produce con `Money` y los baja con `toPrismaDecimal()`.
 */
export interface LineaSistemaData {
  cuentaId: string;
  /** §4.1/B-1: obligatorio si la cuenta tiene `requiereContacto`. El writer lo verifica. */
  contactoId: string | null;
  moneda: Moneda;
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
  tipoCambio: Prisma.Decimal;
  debitoBob: Prisma.Decimal;
  creditoBob: Prisma.Decimal;
  glosaLinea: string | null;
}

export interface CrearSistemaData {
  tenantId: string;
  tipo: TipoComprobante;
  /**
   * @db.Date ya construido vía `FechaContable.toDbDate()` (§4.6).
   *
   * El período fiscal NO se recibe: lo resuelve el writer a partir de esta
   * fecha. Recibir los dos abre la puerta a que no coincidan, y un comprobante
   * archivado en un período que no le corresponde descuadra los reportes de
   * ese mes sin que nada falle en el momento.
   */
  fechaContable: Date;
  glosa: string;
  monedaPrincipal: Moneda;
  origenTipo: OrigenTipoComercial;
  /** Id de la venta o del cobro. Junto con `origenTipo` da la idempotencia (§4.9). */
  origenId: string;
  /** El path-sistema no tiene usuario humano, pero el schema exige el actor. */
  createdByUserId: string;
  lineas: LineaSistemaData[];
}

export interface RegenerarSistemaData {
  tenantId: string;
  comprobanteId: string;
  /**
   * @db.Date. Mover la fecha a otro mes NO cambia el número ya asignado (§4.3).
   * El período se resuelve desde acá, igual que en el alta.
   */
  fechaContable: Date;
  glosa: string;
  monedaPrincipal: Moneda;
  lineas: LineaSistemaData[];
}

export interface AnularSistemaData {
  tenantId: string;
  comprobanteId: string;
  /** §4.7: mínimo 10 caracteres significativos. El writer lo verifica. */
  motivo: string;
  anuladoPorUserId: string;
}

// ============================================================
// Port
// ============================================================

/**
 * Superficie de escritura de comprobantes por el path-sistema comercial.
 *
 * ## El `tx` es OBLIGATORIO, y no es un detalle
 *
 * A diferencia de `CierreComprobanteWriterPort` (que lo toma opcional), acá la
 * transacción es un parámetro requerido. Dos razones:
 *
 * 1. **Atomicidad**: la venta y su comprobante nacen y mutan juntos. Si el
 *    comprobante se escribiera fuera de la TX de la venta, un fallo posterior
 *    dejaría un asiento huérfano — plata registrada sin venta que la explique.
 * 2. **Auditoría**: los triggers de `comprobantes_audit` leen el actor de
 *    `app.audit_user_id`, que inyecta `AuditedTransactionRunner` al abrir la TX
 *    (§4.3). Escribir con el cliente suelto graba la fila de auditoría **sin
 *    actor**. Un `tx` opcional convierte esa pérdida en un olvido silencioso; un
 *    `tx` requerido la hace imposible de escribir por accidente.
 *
 * El caller obtiene el `tx` de `AuditedTransactionRunner.run` (que vive en
 * `common/`, alcanzable desde cualquier módulo).
 */
export abstract class ComprobanteSistemaWriterPort {
  /**
   * Crea el comprobante en BORRADOR con `generadoPorSistema = true`.
   *
   * **Idempotente** (Anti-17, §4.9): escribe con `upsert` sobre el
   * `@@unique([organizationId, origenTipo, origenId])`, nunca con `create`
   * ciego. Si el comprobante de ese origen ya existe, lo devuelve sin tocarlo —
   * para cambiarle las líneas está `regenerarLineasSistema`. Correr el generador
   * dos veces (retry, doble submit) deja UN solo comprobante.
   *
   * Re-valida las líneas contra las cuentas y los invariantes de §4.1.
   */
  abstract crearBorradorSistema(
    data: CrearSistemaData,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }>;

  /**
   * Reemplaza las líneas en bloque preservando la cabecera, el `id` y el
   * `numero` (§4.3 + §4.9).
   *
   * PROHIBIDO el patrón del cierre (borrar y recrear el comprobante entero): a
   * un CONTABILIZADO le cambiaría el número, que es INMUTABLE desde la primera
   * contabilización. El `tipo` tampoco se toma del caller — se preserva el del
   * comprobante existente.
   *
   * Aplica a BORRADOR y a CONTABILIZADO en período abierto.
   */
  abstract regenerarLineasSistema(
    data: RegenerarSistemaData,
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Pasa el comprobante de BORRADOR a CONTABILIZADO asignando el correlativo
   * atómico de su serie (§4.9).
   *
   * Corre exactamente las mismas validaciones que el `contabilizar` de usuario:
   * comparten el núcleo, no una copia (ver `ComprobantesService.contabilizarEnTx`).
   */
  abstract contabilizarSistema(
    comprobanteId: string,
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ numero: string }>;

  /**
   * Anula por flag (§4.7): `anulado = true` + metadatos. No genera
   * contra-asiento, no libera el número, no borra nada.
   *
   * Este es el ÚNICO camino por el que se anula un comprobante comercial: el
   * `anular` de usuario los rechaza con 409 (REQ-CMP-VTA-04) para que la
   * desvinculación de aplicaciones que orquesta el módulo origen no se saltee.
   */
  abstract anularSistema(data: AnularSistemaData, tx: Prisma.TransactionClient): Promise<void>;

  /**
   * Borra físicamente un BORRADOR de sistema junto con su venta (D-19).
   * NO aplica el bloqueo de `generadoPorSistema` del flujo de usuario — es el
   * canal interno autorizado. Scoped al tenant (§4.2) y restringido a BORRADOR:
   * un CONTABILIZADO no se borra, se anula.
   */
  abstract eliminarBorradorSistema(
    comprobanteId: string,
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}
