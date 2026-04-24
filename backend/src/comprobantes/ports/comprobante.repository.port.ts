// Puerto del repositorio del módulo `comprobantes`. Expone la superficie
// de persistencia (write + read) para que el servicio nunca toque Prisma
// directamente (Anti-31 CLAUDE.md §8.1).
//
// También incluye el write de `ComprobanteAuditoria`: misma transacción que
// el comprobante siempre (defense in depth — un write sin su auditoría sería
// invariante roto).

import type {
  AccionAuditoriaComprobante,
  Comprobante,
  EstadoComprobante,
  LineaComprobante,
  Moneda,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

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
  createdByUserId: string;
  lineas: LineaPersistData[];
}

export interface ComprobanteReemplazarBorradorData {
  tipo: TipoComprobante;
  fechaContable: Date;
  periodoFiscalId: string;
  glosa: string;
  monedaPrincipal: Moneda;
  lineas: LineaPersistData[];
}

export interface ReversionCreateData {
  tipo: TipoComprobante; // siempre AJUSTE por ahora
  numero: string; // asignado por el caller vía SecuenciaComprobantePort
  fechaContable: Date;
  periodoFiscalId: string;
  glosa: string;
  monedaPrincipal: Moneda;
  totalDebitoBob: Prisma.Decimal; // igual al totalCreditoBob del original
  totalCreditoBob: Prisma.Decimal; // igual al totalDebitoBob del original
  createdByUserId: string;
  anulaAId: string; // FK 1:1 al comprobante que se anula
  lineas: LineaPersistData[]; // débitos y créditos invertidos vs el original
}

export interface AnulacionMetadata {
  anuladoEn: Date;
  anuladoPorUserId: string;
  motivoAnulacion: string;
}

export interface ListarFiltros {
  periodoFiscalId?: string;
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  fechaDesde?: Date;
  fechaHasta?: Date;
  q?: string;
}

export interface AuditoriaCreateData {
  comprobanteId: string;
  userId: string;
  accion: AccionAuditoriaComprobante;
  diff: Prisma.InputJsonValue;
  fueDuranteReapertura?: boolean;
  reaperturaId?: string | null;
}

export type ComprobanteConLineas = Comprobante & { lineas: LineaComprobante[] };

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
   * Reemplaza completamente los campos editables y las líneas de un comprobante
   * en BORRADOR. El caller debe haber validado que el estado sea BORRADOR; el
   * repo no vuelve a chequearlo. Elimina todas las líneas existentes y crea
   * las nuevas en la misma operación (deleteMany + create dentro de
   * `lineas` nested). Postgres preserva atomicidad por TX de Prisma.
   */
  abstract reemplazarBorrador(
    tenantId: string,
    id: string,
    data: ComprobanteReemplazarBorradorData,
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
   * Crea un comprobante directamente en estado CONTABILIZADO con anulaAId
   * apuntando al original. El caller ya asignó el número y calculó los
   * totales invertidos. Se usa SOLO para el flujo de anulación con
   * reversión — no es una ruta de contabilización manual.
   */
  abstract crearReversion(
    tenantId: string,
    data: ReversionCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas>;

  /**
   * Marca un comprobante CONTABILIZADO como ANULADO y persiste los metadatos
   * de la anulación. El caller ya debe haber creado la reversión y validado
   * que el estado actual es CONTABILIZADO.
   */
  abstract marcarAnulado(
    tenantId: string,
    id: string,
    metadata: AnulacionMetadata,
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
   * Lista paginada con filtros. Ordena por fechaContable DESC y numero DESC
   * (NULLs primero → borradores del día arriba). La paginación es obligatoria
   * (Anti-28); el caller ya debe haber validado el límite.
   */
  abstract listar(
    tenantId: string,
    filtros: ListarFiltros,
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: ComprobanteConLineas[]; total: number }>;

  /**
   * Registra una fila en ComprobanteAuditoria. Debe correr en la misma TX
   * que el write del comprobante que audita.
   */
  abstract registrarAuditoria(
    tenantId: string,
    data: AuditoriaCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
