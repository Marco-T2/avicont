import type {
  PeriodoFiscal,
  PeriodoFiscalReopening,
  PeriodoFiscalStatus,
  Prisma,
} from '@prisma/client';

export abstract class PeriodoFiscalRepositoryPort {
  abstract findById(id: string, organizationId: string): Promise<PeriodoFiscal | null>;

  abstract findByYearMonth(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<PeriodoFiscal | null>;

  abstract listByGestion(
    gestionId: string,
    organizationId: string,
    filters?: { status?: PeriodoFiscalStatus },
  ): Promise<PeriodoFiscal[]>;

  abstract cerrar(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<PeriodoFiscal>;

  abstract reabrir(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ): Promise<PeriodoFiscal>;

  abstract marcarDefinitivo(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ): Promise<PeriodoFiscal>;

  abstract crearReapertura(
    tx: Prisma.TransactionClient,
    data: {
      periodoId: string;
      reopenedByUserId: string;
      motivo: string;
    },
  ): Promise<PeriodoFiscalReopening>;
}

export const PERIODO_FISCAL_REPOSITORY_PORT = Symbol('PERIODO_FISCAL_REPOSITORY_PORT');
