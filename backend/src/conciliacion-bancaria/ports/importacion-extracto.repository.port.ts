// Puerto del repositorio de `ImportacionExtracto` (REQ-CB-05/06/13). Multi-tenancy
// defense in depth (CLAUDE.md §4.2): toda query filtra por tenantId.

import type {
  EstadoVerificacionExtracto,
  ImportacionExtracto,
  PerfilExtracto,
  Prisma,
} from '@prisma/client';

export const IMPORTACION_EXTRACTO_REPOSITORY_PORT = Symbol('IMPORTACION_EXTRACTO_REPOSITORY_PORT');

export interface ImportacionExtractoCreateData {
  cuentaBancariaId: string;
  nombreArchivo: string;
  sha256Archivo: string;
  tamanioBytes: number;
  perfilExtracto: PerfilExtracto;
  fechaDesde: Date;
  fechaHasta: Date;
  coberturaDeclarada: boolean;
  saldoInicial: Prisma.Decimal | null;
  saldoFinal: Prisma.Decimal | null;
  estadoVerificacion: EstadoVerificacionExtracto;
  diferencia: Prisma.Decimal | null;
  filasLeidas: number;
  movimientosNuevos: number;
  movimientosDuplicados: number;
  importadoPorUserId: string;
}

export interface ListarImportacionesPagination {
  page: number;
  limit: number;
}

/**
 * Proyección MÍNIMA para evaluar la integridad de la serie de extractos
 * (REQ-CB-09/23). Deliberadamente SIN paginar: los huecos de cobertura y la
 * continuidad de saldo son propiedades del CONJUNTO — evaluarlas sobre una
 * página daría un veredicto falso.
 */
export interface CoberturaImportacionRow {
  id: string;
  fechaDesde: Date;
  fechaHasta: Date;
  saldoInicial: Prisma.Decimal | null;
  saldoFinal: Prisma.Decimal | null;
}

export abstract class ImportacionExtractoRepositoryPort {
  abstract crear(
    tenantId: string,
    data: ImportacionExtractoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<ImportacionExtracto>;

  /** REQ-CB-13: null si no existe o pertenece a otro tenant. */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ImportacionExtracto | null>;

  /** Lista las importaciones de una cuenta bancaria, orden createdAt DESC. */
  abstract listarPorCuentaBancaria(
    tenantId: string,
    cuentaBancariaId: string,
    pagination: ListarImportacionesPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: ImportacionExtracto[]; total: number }>;

  /**
   * Actualiza los contadores finales de una importación (design §10): se
   * crea la fila ANTES de insertar los movimientos (FK `importacionId`
   * requerido) con contadores en 0, y se corrigen tras conocer el resultado
   * real de `createMany({ skipDuplicates: true })`. Misma `$transaction`.
   */
  abstract actualizarContadores(
    tenantId: string,
    id: string,
    contadores: { movimientosNuevos: number; movimientosDuplicados: number },
    tx?: Prisma.TransactionClient,
  ): Promise<ImportacionExtracto>;

  /** design §10 — "ya existe para la cuenta → aviso, NO error". */
  /**
   * TODAS las importaciones de una cuenta bancaria, proyectadas a lo mínimo
   * para evaluar cobertura y continuidad (REQ-CB-09/23). Sin paginación a
   * propósito — ver `CoberturaImportacionRow`.
   */
  abstract listarCoberturaPorCuentaBancaria(
    tenantId: string,
    cuentaBancariaId: string,
  ): Promise<CoberturaImportacionRow[]>;

  abstract existePorSha256(
    tenantId: string,
    cuentaBancariaId: string,
    sha256Archivo: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;
}
