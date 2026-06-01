import { Inject, Injectable } from '@nestjs/common';
import { GestionFiscal, GestionFiscalStatus } from '@prisma/client';

import { CLOCK_PORT, ClockPort } from '@/common/clock';
import { calcularMesInicio } from '@/common/domain/cierre-fiscal-por-tipo-empresa';
import { PrismaService } from '@/common/prisma.service';
// Cross-module import a un adapter: este service ya bypassea TenantRepositoryPort
// para leer tipoEmpresaPrincipal dentro de la misma TX que crea la gestión; el
// mapeo Prisma → dominio del enum sigue la misma frontera. Se internaliza si más
// adelante el flujo pasa a consumir un TenantsReaderPort transaccional.
import { toDominioTipoEmpresa } from '@/tenants/adapters/enum-mappers';

import {
  GestionConPeriodosAbiertosError,
  GestionDuplicadaError,
  GestionNoEncontradaError,
  GestionYaCerradaError,
  GestionYearFueraDeRangoError,
  TenantSinTipoEmpresaError,
} from './domain/errors';
import {
  CrearPeriodoData,
  GESTION_FISCAL_REPOSITORY_PORT,
  GestionConPeriodos,
  GestionFiscalRepositoryPort,
} from './ports/gestion-fiscal.repository.port';

const YEAR_MIN = 2000;

@Injectable()
export class GestionesFiscalesService {
  constructor(
    @Inject(GESTION_FISCAL_REPOSITORY_PORT)
    private readonly repo: GestionFiscalRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly prisma: PrismaService,
  ) {}

  async crear(tenantId: string, year: number): Promise<GestionConPeriodos> {
    const currentYear = this.clock.currentYearLaPaz();
    const yearMax = currentYear + 1;
    if (year < YEAR_MIN || year > yearMax) {
      throw new GestionYearFueraDeRangoError(year, YEAR_MIN, yearMax);
    }

    // Pre-TX fail-fast: verificar duplicado.
    const existente = await this.repo.findByYear(tenantId, year);
    if (existente) {
      throw new GestionDuplicadaError(tenantId, year);
    }

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: tenantId },
        select: { tipoEmpresaPrincipal: true },
      });

      if (!org.tipoEmpresaPrincipal) {
        throw new TenantSinTipoEmpresaError(tenantId);
      }

      const mesInicio = calcularMesInicio(toDominioTipoEmpresa(org.tipoEmpresaPrincipal));
      const periodos = this.generarPeriodos(tenantId, year, mesInicio);

      return this.repo.crearGestionConPeriodos(
        tx,
        { organizationId: tenantId, year, mesInicio },
        periodos,
      );
    });
  }

  listar(
    tenantId: string,
    filters: { status?: GestionFiscalStatus } = {},
  ): Promise<GestionFiscal[]> {
    return this.repo.listByOrganization(tenantId, filters);
  }

  async obtenerPorId(id: string, tenantId: string): Promise<GestionConPeriodos> {
    const gestion = await this.repo.findByIdWithPeriodos(id, tenantId);
    if (!gestion) {
      throw new GestionNoEncontradaError(id);
    }
    return gestion;
  }

  async cerrar(id: string, tenantId: string, userId: string): Promise<GestionFiscal> {
    return this.prisma.$transaction(async (tx) => {
      const gestion = await this.repo.findByIdWithPeriodos(id, tenantId);
      if (!gestion) {
        throw new GestionNoEncontradaError(id);
      }
      if (gestion.status === 'CERRADA') {
        throw new GestionYaCerradaError(id);
      }

      const periodosAbiertos = gestion.periodos.filter((p) => p.status === 'ABIERTO');
      if (periodosAbiertos.length > 0) {
        throw new GestionConPeriodosAbiertosError(
          id,
          periodosAbiertos.map((p) => ({
            year: p.year,
            month: p.month,
            orden: p.ordenEnGestion,
          })),
        );
      }

      return this.repo.cerrarGestion(tx, id, tenantId, userId);
    });
  }

  // Calcula (year, month, ordenEnGestion) para cada uno de los 12 períodos
  // a partir de year + mesInicio. Los períodos que caen en el calendario del
  // año siguiente (caso INDUSTRIAL, AGROPECUARIA, MINERA) reciben year+1.
  private generarPeriodos(tenantId: string, year: number, mesInicio: number): CrearPeriodoData[] {
    const result: CrearPeriodoData[] = [];
    for (let i = 0; i < 12; i++) {
      const mesReal = ((mesInicio - 1 + i) % 12) + 1;
      const yearReal = mesInicio + i > 12 ? year + 1 : year;
      result.push({
        organizationId: tenantId,
        gestionId: '', // será sobrescrito por el repositorio al crear
        year: yearReal,
        month: mesReal,
        ordenEnGestion: i + 1,
      });
    }
    return result;
  }
}
