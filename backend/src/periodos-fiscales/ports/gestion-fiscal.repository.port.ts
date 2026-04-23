import type {
  GestionFiscal,
  GestionFiscalStatus,
  PeriodoFiscal,
  Prisma,
} from '@prisma/client';

export type GestionConPeriodos = GestionFiscal & { periodos: PeriodoFiscal[] };

export interface CrearGestionData {
  organizationId: string;
  year: number;
  mesInicio: number;
}

export interface CrearPeriodoData {
  organizationId: string;
  gestionId: string;
  year: number;
  month: number;
  ordenEnGestion: number;
}

export abstract class GestionFiscalRepositoryPort {
  abstract findByYear(
    organizationId: string,
    year: number,
  ): Promise<GestionFiscal | null>;

  abstract findByIdWithPeriodos(
    id: string,
    organizationId: string,
  ): Promise<GestionConPeriodos | null>;

  abstract listByOrganization(
    organizationId: string,
    filters?: { status?: GestionFiscalStatus },
  ): Promise<GestionFiscal[]>;

  abstract existsForOrganization(organizationId: string): Promise<boolean>;

  /**
   * Transacción atómica: crea la gestión + los 12 períodos.
   * Toda la operación se ejecuta dentro de la transacción que recibe como tx.
   */
  abstract crearGestionConPeriodos(
    tx: Prisma.TransactionClient,
    gestion: CrearGestionData,
    periodos: CrearPeriodoData[],
  ): Promise<GestionConPeriodos>;

  abstract cerrarGestion(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
  ): Promise<GestionFiscal>;
}

export const GESTION_FISCAL_REPOSITORY_PORT = Symbol(
  'GESTION_FISCAL_REPOSITORY_PORT',
);
