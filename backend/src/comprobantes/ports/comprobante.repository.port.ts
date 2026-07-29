// Puerto del repositorio del módulo `comprobantes`. Expone la superficie
// de persistencia (write + read) para que el servicio nunca toque Prisma
// directamente (Anti-31 CLAUDE.md §8.1).

import type {
  Comprobante,
  EstadoComprobante,
  LineaComprobante,
  Moneda,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

import type { ComprobanteAuditEntry } from './comprobante-audit.types';

export const COMPROBANTE_REPOSITORY_PORT = Symbol('COMPROBANTE_REPOSITORY_PORT');

// ============================================================
// Tipos de datos aceptados por el repo
// ============================================================

export interface LineaPersistData {
  orden: number;
  cuentaId: string;
  contactoId: string | null;
  moneda: Moneda;
  debito: string | Prisma.Decimal;
  credito: string | Prisma.Decimal;
  tipoCambio: string | Prisma.Decimal;
  debitoBob: string | Prisma.Decimal;
  creditoBob: string | Prisma.Decimal;
  glosaLinea: string | null;
}

export interface ComprobanteCreateBorradorData {
  tipo: TipoComprobante;
  fechaContable: Date; // @db.Date ya construido vía FechaContable.toDbDate()
  periodoFiscalId: string;
  glosa: string;
  monedaPrincipal: Moneda;
  // T/C de PRESENTACIÓN del encabezado. Nunca entra a LineaPersistData (§T/C-sep).
  tipoCambioReexpresion?: string | Prisma.Decimal;
  createdByUserId: string;
  lineas: LineaPersistData[];
}

/**
 * Alta de un comprobante por el PATH-SISTEMA (ventas, cobros).
 *
 * Se separa de `ComprobanteCreateBorradorData` porque lleva los tres campos que
 * el flujo de usuario NO expone y que no tendría sentido hacer opcionales ahí:
 * `generadoPorSistema` (lo fija el repo en `true`) y el par `origenTipo`/`origenId`,
 * que es lo que da la idempotencia del auto-asiento (§4.9, Anti-17).
 */
export interface ComprobanteCrearSistemaData {
  tipo: TipoComprobante;
  fechaContable: Date; // @db.Date ya construido vía FechaContable.toDbDate()
  periodoFiscalId: string;
  glosa: string;
  monedaPrincipal: Moneda;
  origenTipo: string;
  origenId: string;
  createdByUserId: string;
  lineas: LineaPersistData[];
}

export interface ComprobanteReemplazarComprobanteData {
  tipo: TipoComprobante;
  fechaContable: Date;
  periodoFiscalId: string;
  glosa: string;
  monedaPrincipal: Moneda;
  // T/C de PRESENTACIÓN del encabezado. Nunca entra a LineaPersistData (§T/C-sep).
  tipoCambioReexpresion?: string | Prisma.Decimal;
  lineas: LineaPersistData[];
  // Totales recalculados a partir de las lineas (Código Tributario art. 47 — partida doble).
  // Se persisten en la cabecera para que los reportes no tengan que sumar lineas en tiempo real.
  // Opcional para borradores (donde los totales no son significativos hasta contabilizar).
  totalDebitoBob?: Prisma.Decimal;
  totalCreditoBob?: Prisma.Decimal;
}

/**
 * Datos de anulación in-place (flag-based, §4.7 CLAUDE.md).
 * El UPDATE activa el flag anulado=true y persiste los 3 metadatos.
 */
export interface AnularData {
  fechaAnulacion: Date;
  motivoAnulacion: string;
  anuladoPorUserId: string;
}

export interface ListarFiltros {
  periodoFiscalId?: string;
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  fechaDesde?: Date;
  fechaHasta?: Date;
  q?: string;
  /** Cuando false (default), el repo filtra WHERE anulado = false. REQ-COMP-REPORTES-01. */
  incluirAnulados?: boolean;
}

export type ComprobanteConLineas = Comprobante & { lineas: LineaComprobante[] };

/**
 * Fila del listado: el comprobante con una proyección liviana para la tabla.
 * No trae las líneas completas — solo el contacto de cada una (para derivar
 * los contactos distintos) y los documentos físicos de respaldo asociados.
 */
export type ComprobanteListRow = Comprobante & {
  lineas: { contacto: { id: string; razonSocial: string } | null }[];
  documentosFisicosAsociados: {
    documentoFisico: {
      id: string;
      numero: string;
      tipoDocumento: { nombre: string };
    };
  }[];
};

// ============================================================
// Port
// ============================================================

export abstract class ComprobanteRepositoryPort {
  /** Persiste un comprobante en estado BORRADOR con sus líneas atómicamente. */
  abstract crearBorrador(
    tenantId: string,
    data: ComprobanteCreateBorradorData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas>;

  /**
   * Lee un comprobante del tenant, con sus líneas. Retorna null si no existe
   * o pertenece a otro tenant.
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas | null>;

  /**
   * Reemplaza completamente los campos editables y las líneas de un comprobante.
   * Sirve tanto para borradores como para edición de contabilizados (ambos usan
   * el mismo patrón deleteMany + create atómico).
   * El caller debe haber validado el estado antes de invocar; el repo solo persiste.
   * Elimina todas las líneas existentes y crea las nuevas dentro de la misma TX.
   */
  abstract reemplazarComprobante(
    tenantId: string,
    id: string,
    data: ComprobanteReemplazarComprobanteData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas>;

  /**
   * Transiciona un comprobante de BORRADOR a CONTABILIZADO persistiendo el
   * número asignado y los totales cache en BOB. El caller ya debe haber
   * validado (1) estado actual BORRADOR, (2) partida doble, (3) período
   * abierto, (4) numeración atómica.
   */
  abstract contabilizar(
    tenantId: string,
    id: string,
    data: {
      numero: string;
      totalDebitoBob: Prisma.Decimal;
      totalCreditoBob: Prisma.Decimal;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas>;

  /**
   * Marca un comprobante CONTABILIZADO como anulado via flag in-place (§4.7 CLAUDE.md).
   * Setea anulado=true, fechaAnulacion, motivoAnulacion, anuladoPorUserId.
   * El estado permanece CONTABILIZADO — el flag es ortogonal al estado.
   * NO genera contra-asiento ni consume número correlativo.
   * La auditoría la captura el trigger trg_comprobantes_audit.
   */
  abstract anular(
    tenantId: string,
    id: string,
    data: AnularData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas>;

  /**
   * Elimina físicamente un comprobante en BORRADOR. Devuelve la cantidad de
   * filas afectadas (0 o 1) para que el caller distinga "no existía" de
   * "borrado OK". Las líneas se eliminan en cascada por onDelete: Cascade.
   */
  abstract eliminarBorrador(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Alta idempotente de un comprobante de sistema, identificado por su origen.
   *
   * Si ya existe un comprobante para `(tenantId, origenTipo, origenId)` lo
   * devuelve **sin tocarlo** — para cambiarle las líneas está
   * `reemplazarComprobante`. Correr el generador dos veces sobre el mismo
   * origen (retry, re-guardado) deja UN solo comprobante.
   *
   * La guarda es el `findUnique` previo; el `@@unique(organizationId,
   * origenTipo, origenId)` de la BD es la línea dura (§4.8: constraint + guard,
   * nunca uno solo). Una carrera genuina —dos altas simultáneas del MISMO
   * origen— viola el UNIQUE y falla ruidosamente, que es la conducta correcta:
   * jamás un duplicado silencioso. En la práctica no ocurre, porque `origenId`
   * es el id de una fila recién creada en la misma transacción.
   */
  abstract crearBorradorSistemaSiNoExiste(
    tenantId: string,
    data: ComprobanteCrearSistemaData,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }>;

  /**
   * Elimina físicamente un BORRADOR **de sistema**. Acotado a
   * `generadoPorSistema = true` además del tenant y del estado: si un bug del
   * módulo comercial pasara el id de un comprobante manual del contador, este
   * where no lo alcanza. Devuelve las filas afectadas (0 o 1).
   */
  abstract eliminarBorradorSistema(
    tenantId: string,
    id: string,
    tx: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Lista paginada con filtros. Ordena por fechaContable DESC y numero DESC
   * (NULLs primero → borradores del día arriba). La paginación es obligatoria
   * (Anti-28); el caller ya debe haber validado el límite.
   */
  abstract listar(
    tenantId: string,
    filtros: ListarFiltros,
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: ComprobanteListRow[]; total: number }>;

  /**
   * Cuenta los comprobantes del tenant que matchean los filtros, sin paginar.
   * Para el tope defensivo del export (REQ cap). Mismo WHERE que listarParaExport.
   */
  abstract contarParaExport(
    tenantId: string,
    filtros: ListarFiltros,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Lista TODOS los comprobantes del tenant que matchean los filtros, SIN paginar.
   * Orden cronológico ASCENDENTE (fechaContable ASC, numero ASC NULLS LAST) — para
   * lectura de auditoría. DISTINTO del orden DESC del listado paginado.
   * El caller (service) ya validó el tope vía contarParaExport.
   */
  abstract listarParaExport(
    tenantId: string,
    filtros: ListarFiltros,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteListRow[]>;

  /**
   * Lista el historial de auditoría de un comprobante desde la tabla raw
   * comprobantes_audit (Postgres triggers). Scopeado al tenant. Orden
   * cronológico ascendente (ts ASC, id ASC). No pagina — volumen esperado bajo.
   * Incluye entries de comprobantes y de sus lineas_comprobante.
   */
  abstract listarAuditoria(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteAuditEntry[]>;
}
