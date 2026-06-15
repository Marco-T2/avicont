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
import {
  TIPO_REGISTRO_SEEDER_PORT,
  TipoRegistroSeederPort,
} from '../granja/ports/tipo-registro-seeder.port';
import { PrismaService } from '../common/prisma.service';

import { isEmail } from 'class-validator';

import { CreateTenantDto, ModuloOrganizacion } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';
import { TenantCurrentResponseDto } from './dto/tenant-current-response.dto';
import { TenantSlug } from './domain/tenant-slug';
import { toDominioTipoEmpresa } from './adapters/enum-mappers';
import {
  TenantNoEncontradoError,
  TenantSlugDuplicadoError,
  TipoEmpresaInmutableError,
  VerticalNoExclusivoError,
  TenantNitInvalidoError,
  TenantEmailInvalidoError,
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
    @Inject(TIPO_REGISTRO_SEEDER_PORT)
    private readonly tipoRegistroSeeder: TipoRegistroSeederPort,
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
          // Siembra los 12 tipos de registro fábrica dentro de la misma TX de
          // creación: la org GRANJA nace con sus tipos o no nace (design.md §8).
          await this.tipoRegistroSeeder.seedDefaultsForTenant(org.id, tx);
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

  /**
   * Devuelve el perfil completo del tenant actual con el flag derivado
   * `tipoEmpresaEditable`, que indica si `tipoEmpresaPrincipal` aún puede
   * modificarse (solo cuando no existe ninguna gestión fiscal — Ley 843 art. 46).
   *
   * Llama a `findById` y `gestionesReader.existeAlgunaGestion` en paralelo
   * para minimizar latencia.
   */
  async getCurrent(tenantId: string): Promise<TenantCurrentResponseDto> {
    const [tenant, tieneGestion] = await Promise.all([
      this.repo.findById(tenantId),
      this.gestionesReader.existeAlgunaGestion(tenantId),
    ]);

    if (!tenant) {
      throw new TenantNoEncontradoError({ id: tenantId });
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: tenant.plan,
      contabilidadEnabled: tenant.contabilidadEnabled,
      granjaEnabled: tenant.granjaEnabled,
      // El adapter mapea Prisma→dominio en el boundary (enum-mappers.ts).
      tipoEmpresaPrincipal: toDominioTipoEmpresa(tenant.tipoEmpresaPrincipal),
      tiposEmpresaActivos: tenant.tiposEmpresaActivos.map(toDominioTipoEmpresa),
      tipoEmpresaEditable: !tieneGestion,
      razonSocial: tenant.razonSocial,
      nit: tenant.nit,
      direccion: tenant.direccion,
      representanteLegal: tenant.representanteLegal,
      telefono: tenant.telefono,
      email: tenant.email,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    if (dto.tipoEmpresaPrincipal !== undefined) {
      const tieneGestion = await this.gestionesReader.existeAlgunaGestion(id);
      if (tieneGestion) {
        // Ver docs/disenos/gestiones-periodos-fiscales-v3.md §2.1
        throw new TipoEmpresaInmutableError(id);
      }
    }

    // Guard defensivo — el DTO ya filtró los tipos no-string.
    // Esta segunda capa es defense-in-depth para llamadas directas al service.
    if (dto.nit !== undefined && dto.nit !== null) {
      // RND 10-0025-14: el NIT boliviano tiene entre 7 y 12 dígitos numéricos.
      if (!/^\d{7,12}$/.test(dto.nit.trim())) {
        throw new TenantNitInvalidoError(dto.nit);
      }
    }

    if (dto.email !== undefined && dto.email !== null) {
      if (!isEmail(dto.email)) {
        throw new TenantEmailInvalidoError(dto.email);
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

    // Solo la transición OFF→ON dispara el seed (design.md §8).
    const seSembrarGranja = granjaEnabled && !current.granjaEnabled;

    const updated = await this.repo.updateFeatures(tenantId, dto);

    // Seed-on-activation: fuera de TX. La org ya existe; la activación es
    // incremental e idempotente (upsert por organizationId+nombre). Si fallara,
    // el flag ya quedó ON y un re-trigger re-siembra sin duplicar (design.md §8).
    if (seSembrarGranja) {
      await this.tipoRegistroSeeder.seedDefaultsForTenant(tenantId);
    }

    // Invalidar el cache que usa ModuleEnabledGuard.
    try {
      await this.redis.del(`org-features:${tenantId}`);
    } catch (e) {
      this.logger.warn(`Failed to invalidate features cache: ${(e as Error).message}`);
    }

    return updated;
  }
}
