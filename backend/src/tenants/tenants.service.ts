import { Injectable, Inject, Logger } from '@nestjs/common';

import { RedisService } from '../cache/redis.service';
import {
  GESTIONES_READER_PORT,
  GestionesReaderPort,
} from '../periodos-fiscales/ports/gestiones-reader.port';
import {
  MEMBERSHIPS_READER_PORT,
  MembershipsReaderPort,
} from '../memberships/ports/memberships-reader.port';
import {
  PLAN_CUENTAS_SEEDER_PORT,
  PlanCuentasSeederPort,
} from '../cuentas/ports/plan-cuentas-seeder.port';
import {
  TIPO_DOCUMENTO_FISICO_SEEDER_PORT,
  TipoDocumentoFisicoSeederPort,
} from '../tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port';
import { PrismaService } from '../common/prisma.service';

import { CreateTenantDto, ModuloOrganizacion } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';
import { TenantSlug } from './domain/tenant-slug';
import {
  TenantNoEncontradoError,
  TenantSlugDuplicadoError,
  TipoEmpresaInmutableError,
  VerticalNoExclusivoError,
} from './domain/tenant-errors';
import { TENANT_REPOSITORY_PORT, TenantRepositoryPort } from './ports/tenant.repository.port';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly repo: TenantRepositoryPort,
    @Inject(MEMBERSHIPS_READER_PORT)
    private readonly memberships: MembershipsReaderPort,
    @Inject(GESTIONES_READER_PORT)
    private readonly gestionesReader: GestionesReaderPort,
    private readonly redis: RedisService,
    @Inject(PLAN_CUENTAS_SEEDER_PORT)
    private readonly planCuentasSeeder: PlanCuentasSeederPort,
    @Inject(TIPO_DOCUMENTO_FISICO_SEEDER_PORT)
    private readonly tiposDocSeeder: TipoDocumentoFisicoSeederPort,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Mapea el módulo elegido en el alta a los feature flags de la organización.
   * El `modulo` es un input transitorio — no se persiste como columna (Design D1).
   */
  private flagsParaModulo(modulo: ModuloOrganizacion): {
    contabilidadEnabled: boolean;
    granjaEnabled: boolean;
  } {
    switch (modulo) {
      case ModuloOrganizacion.CONTABILIDAD:
        return { contabilidadEnabled: true, granjaEnabled: false };
      case ModuloOrganizacion.GRANJA:
        return { contabilidadEnabled: false, granjaEnabled: true };
      case ModuloOrganizacion.OTROS:
        return { contabilidadEnabled: false, granjaEnabled: false };
    }
  }

  async create(dto: CreateTenantDto, ownerId: string) {
    const slug = TenantSlug.fromName(dto.name).toString();
    if (await this.repo.existsBySlug(slug)) {
      throw new TenantSlugDuplicadoError(slug);
    }

    const flags = this.flagsParaModulo(dto.modulo);

    return this.prisma.$transaction(async (tx) => {
      const org = await this.repo.create(
        { slug, name: dto.name, ownerUserId: ownerId, ...flags },
        tx,
      );

      switch (dto.modulo) {
        case ModuloOrganizacion.CONTABILIDAD:
          await this.planCuentasSeeder.seedDefaultsForTenant(org.id, tx);
          // Los tipos de documento físico respaldan comprobantes contables, así
          // que se siembran junto al plan de cuentas. Dentro de la misma TX: el
          // tenant nace con los 8 tipos universales o no nace (design §D3, §7.2).
          await this.tiposDocSeeder.seedDefaultsForTenant(org.id, tx);
          break;
        case ModuloOrganizacion.GRANJA:
          // Placeholder: módulo granja sin código de seeding aún. Flags ya seteados arriba.
          break;
        case ModuloOrganizacion.OTROS:
          // no-op: sin módulo específico, sin seeding adicional
          break;
      }

      return org;
    });
  }

  async findById(id: string) {
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new TenantNoEncontradoError({ id });
    }
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.repo.findBySlug(slug);
    if (!tenant) {
      throw new TenantNoEncontradoError({ slug });
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    if (dto.tipoEmpresaPrincipal !== undefined) {
      const tieneGestion = await this.gestionesReader.existeAlgunaGestion(id);
      if (tieneGestion) {
        // Ver docs/disenos/gestiones-periodos-fiscales-v3.md §2.1
        throw new TipoEmpresaInmutableError(id);
      }
    }
    return this.repo.update(id, dto);
  }

  async getMembers(tenantId: string) {
    return this.memberships.findAllByTenant(tenantId);
  }

  // ------ Feature flags por organización (módulos) ------

  async getFeatures(tenantId: string) {
    const features = await this.repo.findFeatures(tenantId);
    if (!features) {
      throw new TenantNoEncontradoError({ id: tenantId });
    }
    return features;
  }

  async updateFeatures(tenantId: string, dto: UpdateFeaturesDto) {
    const current = await this.repo.findFeatures(tenantId);
    if (!current) {
      throw new TenantNoEncontradoError({ id: tenantId });
    }

    // §10.4 (docs/disenos/plataforma-multi-vertical.md): vertical exclusivo por
    // org. El patch es parcial, así que se valida el estado RESULTANTE, no el dto
    // suelto. Defense in depth con el CHECK constraint de la BD (§4.8).
    const contabilidadEnabled = dto.contabilidadEnabled ?? current.contabilidadEnabled;
    const granjaEnabled = dto.granjaEnabled ?? current.granjaEnabled;
    if (contabilidadEnabled && granjaEnabled) {
      throw new VerticalNoExclusivoError(tenantId);
    }

    const updated = await this.repo.updateFeatures(tenantId, dto);

    // Invalidar el cache que usa ModuleEnabledGuard.
    try {
      await this.redis.del(`org-features:${tenantId}`);
    } catch (e) {
      this.logger.warn(`Failed to invalidate features cache: ${(e as Error).message}`);
    }

    return updated;
  }
}
