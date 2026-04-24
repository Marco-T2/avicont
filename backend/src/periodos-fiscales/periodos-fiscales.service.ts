import { Inject, Injectable } from '@nestjs/common';
import { PeriodoFiscal, PeriodoFiscalStatus } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import {
  COMPROBANTES_LOCK_PORT,
  ComprobantesLockPort,
  ResumenPeriodo,
} from '@/comprobantes/ports/comprobantes-lock.port';

import { RangoPeriodoFiscal } from './domain/rango-periodo-fiscal';

import {
  MotivoReaperturaInvalidoError,
  PeriodoCerradoError,
  PeriodoConBorradoresError,
  PeriodoDefinitivoNoReabribleError,
  PeriodoNoCerradoError,
  PeriodoNoEncontradoError,
  PeriodoYaAbiertoError,
} from './domain/errors';
import {
  PERIODO_FISCAL_REPOSITORY_PORT,
  PeriodoFiscalRepositoryPort,
} from './ports/periodo-fiscal.repository.port';

const MOTIVO_MIN_CHARS = 20;

export interface ResumenPrecierre {
  periodo: {
    id: string;
    year: number;
    month: number;
    ordenEnGestion: number;
    fechaInicio: string;
    fechaFin: string;
  };
  comprobantes: {
    contabilizados: number;
    borradores: number;
    anulados: number;
  };
  totalesBob: {
    totalDebe: string;
    totalHaber: string;
    balanceado: boolean;
  };
  borradoresPendientes: ResumenPeriodo['borradoresList'];
  puedeCerrar: boolean;
  razonNoPuedeCerrar?: string;
}

@Injectable()
export class PeriodosFiscalesService {
  constructor(
    @Inject(PERIODO_FISCAL_REPOSITORY_PORT)
    private readonly repo: PeriodoFiscalRepositoryPort,
    @Inject(COMPROBANTES_LOCK_PORT)
    private readonly comprobantesLock: ComprobantesLockPort,
    private readonly prisma: PrismaService,
  ) {}

  async obtenerPorId(
    id: string,
    tenantId: string,
  ): Promise<PeriodoFiscal> {
    const periodo = await this.repo.findById(id, tenantId);
    if (!periodo) {
      throw new PeriodoNoEncontradoError(id);
    }
    return periodo;
  }

  listar(
    tenantId: string,
    filters: { gestionId?: string; status?: PeriodoFiscalStatus } = {},
  ): Promise<PeriodoFiscal[]> {
    if (filters.gestionId !== undefined) {
      return this.repo.listByGestion(filters.gestionId, tenantId, {
        ...(filters.status !== undefined ? { status: filters.status } : {}),
      });
    }
    // Sin gestionId filtramos a nivel tenant directamente via prisma.
    return this.prisma.periodoFiscal.findMany({
      where: {
        organizationId: tenantId,
        ...(filters.status !== undefined ? { status: filters.status } : {}),
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }

  async obtenerResumenPrecierre(
    id: string,
    tenantId: string,
  ): Promise<ResumenPrecierre> {
    const periodo = await this.obtenerPorId(id, tenantId);
    const rango = RangoPeriodoFiscal.of(periodo.year, periodo.month);

    const resumen = await this.prisma.$transaction((tx) =>
      this.comprobantesLock.obtenerResumenEnPeriodo(tx, id),
    );

    const puedeCerrar =
      periodo.status === 'ABIERTO' && resumen.borradores === 0;

    return {
      periodo: {
        id: periodo.id,
        year: periodo.year,
        month: periodo.month,
        ordenEnGestion: periodo.ordenEnGestion,
        fechaInicio: rango.inicio(),
        fechaFin: rango.fin(),
      },
      comprobantes: {
        contabilizados: resumen.contabilizados,
        borradores: resumen.borradores,
        anulados: resumen.anulados,
      },
      totalesBob: {
        totalDebe: resumen.totalDebeBob,
        totalHaber: resumen.totalHaberBob,
        balanceado: resumen.totalDebeBob === resumen.totalHaberBob,
      },
      borradoresPendientes: resumen.borradoresList,
      puedeCerrar,
      ...(puedeCerrar
        ? {}
        : {
            razonNoPuedeCerrar:
              periodo.status !== 'ABIERTO'
                ? 'El período no está abierto'
                : `Hay ${resumen.borradores} comprobante(s) en borrador. Contabilízalos o elimínalos antes de cerrar.`,
          }),
    };
  }

  async cerrar(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<PeriodoFiscal> {
    return this.prisma.$transaction(async (tx) => {
      const periodo = await this.repo.findById(id, tenantId);
      if (!periodo) {
        throw new PeriodoNoEncontradoError(id);
      }
      if (periodo.status === 'CERRADO') {
        throw new PeriodoCerradoError(id);
      }

      const borradores = await this.comprobantesLock.contarBorradoresEnPeriodo(
        tx,
        id,
      );
      if (borradores > 0) {
        throw new PeriodoConBorradoresError(id, borradores);
      }

      await this.comprobantesLock.bloquearPorPeriodo(tx, id);
      return this.repo.cerrar(tx, id, userId);
    });
  }

  async reabrir(
    id: string,
    tenantId: string,
    userId: string,
    motivo: string,
  ): Promise<PeriodoFiscal> {
    if (motivo.trim().length < MOTIVO_MIN_CHARS) {
      throw new MotivoReaperturaInvalidoError();
    }

    return this.prisma.$transaction(async (tx) => {
      const periodo = await this.repo.findById(id, tenantId);
      if (!periodo) {
        throw new PeriodoNoEncontradoError(id);
      }
      if (periodo.esDefinitivo) {
        throw new PeriodoDefinitivoNoReabribleError(id);
      }
      if (periodo.status === 'ABIERTO') {
        throw new PeriodoYaAbiertoError(id);
      }

      await this.repo.crearReapertura(tx, {
        periodoId: id,
        reopenedByUserId: userId,
        motivo: motivo.trim(),
      });

      await this.comprobantesLock.desbloquearPorPeriodo(tx, id);
      return this.repo.reabrir(tx, id);
    });
  }

  async marcarDefinitivo(
    id: string,
    tenantId: string,
  ): Promise<PeriodoFiscal> {
    return this.prisma.$transaction(async (tx) => {
      const periodo = await this.repo.findById(id, tenantId);
      if (!periodo) {
        throw new PeriodoNoEncontradoError(id);
      }
      if (periodo.status !== 'CERRADO') {
        throw new PeriodoNoCerradoError(id);
      }
      return this.repo.marcarDefinitivo(tx, id);
    });
  }
}
