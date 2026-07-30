// Puerto del repositorio del módulo `cuentas-por-cobrar`. El servicio nunca
// toca Prisma directamente (Anti-31). Molde: `ventas/ports/venta.repository.port.ts`
// (Fase 4 del mismo change).
//
// El cobro NO lleva estado propio ni flag `anulado` (REQ-CXC-02): se leen del
// comprobante vinculado por `(organizationId, origenTipo='COBRO', origenId)`,
// igual que la venta. Por eso este port expone la proyección de LECTURA
// `obtenerComprobantesDeCobros` (§3.7: cada módulo define su read-surface).
// Toda ESCRITURA de comprobantes sigue pasando por
// `ComprobanteSistemaWriterPort`, nunca por acá.
//
// REQ-CXC-04 (sobre-aplicación): el repositorio LEE las sumas bajo lock
// (`obtenerSumasAplicadasConLock`, `obtenerCobroConAplicadoConLock`) y el
// service DECIDE con la función pura de `domain/`. Acá no vive ninguna regla:
// solo la garantía de que lo leído no cambia hasta el commit (Anti-11/Anti-12,
// cicatriz F-03).

import type { EstadoComprobante, Prisma } from '@prisma/client';

export const COBRO_REPOSITORY_PORT = Symbol('COBRO_REPOSITORY_PORT');

export type Cobro = Prisma.CobroGetPayload<Record<string, never>>;
export type AplicacionCobroRow = Prisma.AplicacionCobroGetPayload<Record<string, never>>;

/**
 * Alta del cobro (REQ-CXC-02). El service ya validó todo (contacto del tenant,
 * cuenta destino elegible, período abierto). `monto` como `Prisma.Decimal`,
 * nunca `number` (§4.5): el service lo produce con `Money.toPrismaDecimal()`.
 */
export interface CobroCreateData {
  contactoId: string;
  /** @db.Date construido vía `FechaContable.toDbDate()` (§4.6). */
  fechaContable: Date;
  monto: Prisma.Decimal;
  /** Elegibilidad (REQ-CXC-02) YA validada por el service; la FK solo garantiza existencia. */
  cuentaDestinoId: string;
  glosa: string;
  createdByUserId: string;
}

/**
 * Estado COMPLETO de la cabecera para la edición (mismo criterio que
 * `VentaReemplazoData`): la edición manda todo, no hay campos parciales.
 * Los guards de la matriz de REQ-CXC-06 (bajar monto por debajo de lo
 * aplicado, cambio de contacto que desvincula) son del SERVICE, apoyado en
 * las lecturas bajo lock de este port.
 */
export interface CobroActualizarData {
  contactoId: string;
  fechaContable: Date;
  monto: Prisma.Decimal;
  cuentaDestinoId: string;
  glosa: string;
}

/** Proyección mínima del comprobante que el cobro necesita para operar. */
export interface ComprobanteDeCobro {
  id: string;
  numero: string | null;
  estado: EstadoComprobante;
  anulado: boolean;
}

/**
 * Aplicación vista desde el cobro, en el orden que la desvinculación masiva
 * consume (anular el cobro / cambiarle el contacto, REQ-CXC-06). `createdAt`
 * se expone porque el orden se define por él y el service tiene que poder
 * auditarlo/testearlo (espejo de `AplicacionDeVenta`).
 */
export interface AplicacionDeCobro {
  id: string;
  ventaId: string;
  montoAplicado: Prisma.Decimal;
  createdAt: Date;
}

export interface AplicacionCreateData {
  cobroId: string;
  ventaId: string;
  /** > 0 — una aplicación en 0 no se crea (lo garantiza el service). */
  montoAplicado: Prisma.Decimal;
  createdByUserId: string;
}

/**
 * Fila del rastro append-only `AplicacionCobroDesvinculada` (B-14): lo que
 * queda del acto cuando una `AplicacionCobro` se elimina físicamente al anular
 * el cobro o cambiarle el contacto (REQ-CXC-06). Idéntica a la de ventas — la
 * tabla es la misma; el tipo se duplica porque §3.3 prohíbe importarlo de
 * `ventas/`.
 */
export interface AplicacionDesvinculadaData {
  cobroId: string;
  ventaId: string;
  montoAplicado: Prisma.Decimal;
  motivo: string;
  userId: string;
}

export interface CobroListarFiltros {
  contactoId?: string;
  /** @db.Date (§4.6): límites inclusivos sobre `fechaContable`. */
  fechaDesde?: Date;
  fechaHasta?: Date;
}

export interface CobroListarPagination {
  page: number;
  limit: number;
}

export interface SumasAplicadasParams {
  cobroId: string;
  ventaId: string;
  /**
   * Al EDITAR el monto de una aplicación, las sumas deben excluir la fila que
   * se está editando: el invariante se evalúa como `suma + montoNuevo ≤ límite`
   * de forma uniforme para crear y editar, sin que el service reste a mano.
   */
  excluirAplicacionId?: string;
}

/**
 * Snapshot consistente para decidir una escritura de aplicación (REQ-CXC-04):
 * ambas puntas con su `contactoId` (REQ-CXC-03: mismo contacto) y sus topes,
 * más las sumas ya aplicadas. Todo leído bajo `FOR UPDATE` sobre el cobro y la
 * venta: nada de esto puede cambiar hasta el commit de la TX.
 */
export interface SumasAplicadasConLock {
  cobro: { id: string; contactoId: string; monto: Prisma.Decimal };
  venta: { id: string; contactoId: string; montoTotal: Prisma.Decimal };
  /** Σ montoAplicado de TODAS las aplicaciones del cobro (menos la excluida). */
  aplicadoAlCobro: Prisma.Decimal;
  /** Σ montoAplicado de TODAS las aplicaciones de la venta (menos la excluida). */
  aplicadoALaVenta: Prisma.Decimal;
}

/**
 * Snapshot del cobro solo (sin venta) bajo lock: lo necesita bajar el `monto`
 * del cobro (REQ-CXC-06 fila 8 — `COBRO_MONTO_INFERIOR_APLICADO`) para que una
 * aplicación concurrente no entre entre el chequeo y el UPDATE.
 */
export interface CobroConAplicadoConLock {
  id: string;
  contactoId: string;
  monto: Prisma.Decimal;
  aplicadoAlCobro: Prisma.Decimal;
}

export abstract class CobroRepositoryPort {
  /**
   * Crea el cobro. `tx` OBLIGATORIO: el cobro y su comprobante `INGRESO`
   * (vía `ComprobanteSistemaWriterPort`) nacen en la MISMA transacción
   * (REQ-CXC-02) — un `tx` opcional permitiría escribir el cobro suelto y
   * dejar un comprobante huérfano ante un fallo posterior.
   */
  abstract crear(
    tenantId: string,
    data: CobroCreateData,
    tx: Prisma.TransactionClient,
  ): Promise<Cobro>;

  /**
   * Actualiza la cabecera COMPLETA del cobro. Lanza P2025 si el cobro no
   * existe en el tenant (§4.2 — recurso ajeno se comporta como inexistente;
   * el service traduce a 404). `tx` OBLIGATORIO: la edición regenera el
   * comprobante en la misma transacción, y bajar el monto exige que el guard
   * (`obtenerCobroConAplicadoConLock`) y este UPDATE compartan el lock.
   */
  abstract actualizar(
    tenantId: string,
    cobroId: string,
    data: CobroActualizarData,
    tx: Prisma.TransactionClient,
  ): Promise<Cobro>;

  /** null si no existe o es de otro tenant (§4.2 — cobro ajeno → 404, REQ-CXC-08). */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Cobro | null>;

  /** Paginación obligatoria (Anti-28). Orden: `fechaContable` desc, `createdAt` desc. */
  abstract listar(
    tenantId: string,
    filtros: CobroListarFiltros,
    pagination: CobroListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ cobros: Cobro[]; total: number }>;

  /**
   * Comprobantes de un lote de cobros, indexados por `cobroId` (= `origenId`).
   * Los cobros sin comprobante (no debería pasar) o de otro tenant NO aparecen
   * en el Map. Es la ÚNICA fuente del estado/número/anulado de un cobro
   * (REQ-CXC-02: el cobro no espeja estado — espejo de la venta).
   */
  abstract obtenerComprobantesDeCobros(
    tenantId: string,
    cobroIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ComprobanteDeCobro>>;

  /**
   * Aplicaciones del cobro, la más reciente primero (`createdAt` desc, `id`
   * desc como desempate — mismo orden determinista que el recorte LIFO de
   * ventas): la lista que la desvinculación masiva registra en
   * `AplicacionCobroDesvinculada` al anular el cobro o cambiarle el contacto
   * (REQ-CXC-06).
   */
  abstract listarAplicacionesDeCobro(
    tenantId: string,
    cobroId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AplicacionDeCobro[]>;

  /**
   * Crea la aplicación cobro→venta. Devuelve `null` sin escribir NADA si el
   * cobro o la venta no existen en el tenant — el agujero clásico es aplicar
   * un cobro del tenant A a una venta del tenant B (REQ-CXC-08): el
   * repositorio re-verifica `cobro.organizationId === venta.organizationId
   * === tenantId` aunque el service ya lo haya hecho (defense in depth, §4.2;
   * ninguna capa confía en la anterior). El service traduce `null` a 404.
   *
   * `tx` OBLIGATORIO: DEBE ser la misma TX donde `obtenerSumasAplicadasConLock`
   * tomó los locks — fuera de ella el `SUM()` validado ya no está protegido y
   * REQ-CXC-04 queda en check-then-act (cicatriz F-03).
   */
  abstract crearAplicacion(
    tenantId: string,
    data: AplicacionCreateData,
    tx: Prisma.TransactionClient,
  ): Promise<AplicacionCobroRow | null>;

  /**
   * Edita el `montoAplicado` de UNA aplicación (> 0 — en 0 se elimina, no se
   * actualiza; lo garantiza el service). Lanza P2025 exacto si la aplicación
   * es ajena o inexistente (§4.2). `tx` OBLIGATORIO: misma TX que el lock.
   */
  abstract actualizarMontoAplicacion(
    tenantId: string,
    aplicacionId: string,
    montoAplicado: Prisma.Decimal,
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Borrado FÍSICO de aplicaciones (D-12): no hay soft-delete a propósito —
   * un `deletedAt` obligaría a TODA derivación de `Σ montoAplicado` a llevar
   * `WHERE`, y un filtro olvidado sobre-aplica plata. El rastro va aparte
   * (`registrarAplicacionesDesvinculadas`), en la MISMA TX.
   */
  abstract eliminarAplicaciones(
    tenantId: string,
    aplicacionIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Registra el rastro append-only en `AplicacionCobroDesvinculada` (B-14).
   * Una fila por aplicación eliminada, en la MISMA TX que el borrado físico:
   * borrar sin rastro pierde el acto, rastrear sin borrar duplica plata.
   */
  abstract registrarAplicacionesDesvinculadas(
    tenantId: string,
    aplicaciones: AplicacionDesvinculadaData[],
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Núcleo de REQ-CXC-04: lockea el cobro Y la venta con `SELECT ... FOR
   * UPDATE` (en ese orden — ver el adapter) y devuelve las sumas aplicadas de
   * ambos calculadas con `SUM()` EN SQL (Anti-11), dentro de la misma TX. Dos
   * escrituras concurrentes sobre el mismo cobro o la misma venta se
   * serializan en estos locks: la segunda ve lo que la primera commiteó.
   *
   * Devuelve `null` sin lockear de más si el cobro o la venta no existen en
   * el tenant (§4.2 — el service traduce a 404). La DECISIÓN (¿excede?) no
   * vive acá: es de la función pura de `domain/` que consume el service.
   */
  abstract obtenerSumasAplicadasConLock(
    tenantId: string,
    params: SumasAplicadasParams,
    tx: Prisma.TransactionClient,
  ): Promise<SumasAplicadasConLock | null>;

  /**
   * Variante para mutaciones del cobro que no involucran una venta (bajar el
   * `monto`, REQ-CXC-06 fila 8): lockea SOLO el cobro con `FOR UPDATE` y
   * devuelve su Σ aplicada. Como toda escritura de aplicaciones también
   * lockea el cobro primero, el guard y las aplicaciones concurrentes se
   * serializan entre sí. `null` si el cobro es ajeno o no existe.
   */
  abstract obtenerCobroConAplicadoConLock(
    tenantId: string,
    cobroId: string,
    tx: Prisma.TransactionClient,
  ): Promise<CobroConAplicadoConLock | null>;
}
