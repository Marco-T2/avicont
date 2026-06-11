import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OrganizationStatus } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { RedisService } from '@/cache/redis.service';
import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { USERS_READER_PORT, UsersReaderPort } from '@/users/ports/users-reader.port';
import {
  PLAN_CUENTAS_SEEDER_PORT,
  PlanCuentasSeederPort,
} from '@/cuentas/ports/plan-cuentas-seeder.port';
import {
  TIPO_DOCUMENTO_FISICO_SEEDER_PORT,
  TipoDocumentoFisicoSeederPort,
} from '@/tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port';
import {
  TIPO_REGISTRO_SEEDER_PORT,
  TipoRegistroSeederPort,
} from '@/granja/ports/tipo-registro-seeder.port';
import { TenantSlug } from '@/tenants/domain/tenant-slug';
import { TenantSlugDuplicadoError } from '@/tenants/domain/tenant-errors';
import {
  MEMBERSHIPS_READER_PORT,
  MembershipsReaderPort,
} from '@/memberships/ports/memberships-reader.port';
import { PackService } from '@/packs/pack.service';
import {
  OrgPackEntitlementResponseDto,
  toOrgPackEntitlementResponse,
} from '@/packs/dto/org-pack-entitlement-response.dto';
import { PackResponseDto, toPackResponse } from '@/packs/dto/pack-response.dto';
import { ORGS_READER_PORT, OrgsReaderPort } from './ports/orgs-reader.port';
import { ORGS_WRITER_PORT, OrgsWriterPort } from './ports/orgs-writer.port';
import {
  PLATFORM_STATS_READER_PORT,
  PlatformStatsReaderPort,
} from './ports/platform-stats-reader.port';
import {
  PLATFORM_ACTIVITY_READER_PORT,
  PlatformActivityReaderPort,
} from './ports/platform-activity-reader.port';
import { PlatformOrgResponseDto } from './dto/platform-org-response.dto';
import { PlatformOrgMemberResponseDto } from './dto/platform-org-member-response.dto';
import { PlatformDashboardResponseDto } from './dto/platform-dashboard-response.dto';
import {
  PlatformActivityResponseDto,
  PlatformActivityItemDto,
} from './dto/platform-activity-response.dto';
import { PlatformActivityQueryDto } from './dto/platform-activity-query.dto';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateEntitlementDto } from './dto/update-entitlement.dto';
import {
  PlatformOrgNoEncontradaError,
  PlatformOrgOwnerNotFoundError,
  PlatformVerticalNoExclusivoError,
} from './domain/platform-errors';
import { ActivityCursor } from './lib/activity-cursor';
import { ModuloOrganizacion } from '@/tenants/dto/create-tenant.dto';

@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

  constructor(
    @Inject(ORGS_READER_PORT) private readonly orgsReader: OrgsReaderPort,
    @Inject(ORGS_WRITER_PORT) private readonly orgsWriter: OrgsWriterPort,
    @Inject(USERS_READER_PORT) private readonly usersReader: UsersReaderPort,
    @Inject(PLAN_CUENTAS_SEEDER_PORT) private readonly planCuentasSeeder: PlanCuentasSeederPort,
    @Inject(TIPO_DOCUMENTO_FISICO_SEEDER_PORT)
    private readonly tiposDocSeeder: TipoDocumentoFisicoSeederPort,
    @Inject(TIPO_REGISTRO_SEEDER_PORT) private readonly tipoRegistroSeeder: TipoRegistroSeederPort,
    @Inject(MEMBERSHIPS_READER_PORT)
    private readonly membershipsReader: MembershipsReaderPort,
    private readonly packs: PackService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(PLATFORM_STATS_READER_PORT)
    private readonly statsReader: PlatformStatsReaderPort,
    @Inject(PLATFORM_ACTIVITY_READER_PORT)
    private readonly activityReader: PlatformActivityReaderPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async listarOrgs(): Promise<PlatformOrgResponseDto[]> {
    const orgs = await this.orgsReader.listAll();
    return orgs.map((org) => PlatformOrgResponseDto.fromOrganization(org));
  }

  /**
   * Crea una organización con el OWNER designado por email (REQ-SA-13).
   *
   * Flujo atómico:
   * 1. Resolver ownerEmail → userId (error 422 si no existe).
   * 2. Generar slug único a partir del nombre.
   * 3. Crear org + membership OWNER en una sola TX (OrgsWriterPort.create).
   * 4. Sembrar datos iniciales según módulo (dentro de la misma TX).
   *
   * A diferencia de TenantsService.create, el OWNER no es el caller (super-admin)
   * sino el usuario designado por email. El super-admin actúa como operador
   * de plataforma, no como miembro de la org que crea.
   */
  async crearOrgConOwner(dto: CreateOrgDto): Promise<PlatformOrgResponseDto> {
    const email = dto.ownerEmail.toLowerCase().trim();
    const owner = await this.usersReader.findMinimalByEmail(email);
    if (!owner) {
      throw new PlatformOrgOwnerNotFoundError(email);
    }

    const slug = TenantSlug.fromName(dto.name).toString();

    // Chequeo de slug antes de abrir la TX (friendly error; la UNIQUE constraint
    // actúa como defense in depth bajo concurrencia — CLAUDE.md §4.8).
    const existing = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing !== null) {
      throw new TenantSlugDuplicadoError(slug);
    }

    const flags = this.flagsParaModulo(dto.modulo);

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await this.orgsWriter.create(
        { slug, name: dto.name, ownerUserId: owner.id, ...flags },
        tx,
      );

      switch (dto.modulo) {
        case ModuloOrganizacion.CONTABILIDAD:
          await this.planCuentasSeeder.seedDefaultsForTenant(created.id, tx);
          await this.tiposDocSeeder.seedDefaultsForTenant(created.id, tx);
          break;
        case ModuloOrganizacion.GRANJA:
          await this.tipoRegistroSeeder.seedDefaultsForTenant(created.id, tx);
          break;
        case ModuloOrganizacion.OTROS:
          // no-op: sin módulo específico, sin seeding adicional
          break;
      }

      return created;
    });

    this.logger.log(`Org '${org.name}' (${org.id}) creada por super-admin. OWNER: ${email}`);

    return PlatformOrgResponseDto.fromOrganization(org);
  }

  /**
   * Actualiza el status (ACTIVE/SUSPENDED/ARCHIVED) de una organización (REQ-SA-14).
   * El `:id` viene del path — el super-admin opera cross-tenant sin TenantGuard.
   */
  async actualizarStatus(
    orgId: string,
    status: OrganizationStatus,
  ): Promise<PlatformOrgResponseDto> {
    const org = await this.orgsWriter.updateStatus(orgId, status);
    if (!org) {
      throw new PlatformOrgNoEncontradaError(orgId);
    }
    // Invalidar caché del guard para que el próximo request refleje el nuevo
    // status sin esperar el TTL de 300s (OrgStatusGuard usa clave org-status:<id>).
    await this.redis.del(`org-status:${orgId}`);
    this.logger.log(`Org '${org.name}' (${org.id}) status actualizado a ${status}`);
    return PlatformOrgResponseDto.fromOrganization(org);
  }

  /**
   * Actualiza el plan y/o verticales de una organización (REQ-SA-15).
   * Valida exclusividad de vertical: no pueden estar ambos en true (§10.4).
   * El reader se usa para obtener el estado actual cuando el patch es parcial.
   */
  async actualizarEntitlement(
    orgId: string,
    dto: UpdateEntitlementDto,
  ): Promise<PlatformOrgResponseDto> {
    const current = await this.orgsReader.findById(orgId);
    if (!current) {
      throw new PlatformOrgNoEncontradaError(orgId);
    }

    // Calcular estado resultante de las verticales para validar exclusividad.
    // El patch es parcial: los campos no presentes conservan el valor actual.
    const contabilidadEnabled = dto.contabilidadEnabled ?? current.contabilidadEnabled;
    const granjaEnabled = dto.granjaEnabled ?? current.granjaEnabled;

    // §10.4 (docs/disenos/plataforma-multi-vertical.md): vertical exclusivo.
    // Defense in depth con el CHECK constraint `organizations_vertical_exclusivo_check`.
    if (contabilidadEnabled && granjaEnabled) {
      throw new PlatformVerticalNoExclusivoError(orgId);
    }

    const updated = await this.orgsWriter.updateEntitlement(orgId, {
      ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
      ...(dto.contabilidadEnabled !== undefined
        ? { contabilidadEnabled: dto.contabilidadEnabled }
        : {}),
      ...(dto.granjaEnabled !== undefined ? { granjaEnabled: dto.granjaEnabled } : {}),
    });

    if (!updated) {
      throw new PlatformOrgNoEncontradaError(orgId);
    }

    this.logger.log(`Org '${updated.name}' (${updated.id}) entitlement actualizado`);
    return PlatformOrgResponseDto.fromOrganization(updated);
  }

  /**
   * Lista los miembros de una organización para el panel super-admin (REQ-PM-01).
   *
   * Incluye activos Y desactivados. El SA opera cross-tenant: no requiere
   * TenantGuard pero la lectura queda auditada por PlatformAuditInterceptor
   * (req.tenantId se popula en el controller antes del interceptor).
   *
   * @throws PlatformOrgNoEncontradaError si la org no existe.
   */
  async listarMiembros(orgId: string): Promise<PlatformOrgMemberResponseDto[]> {
    const org = await this.orgsReader.findById(orgId);
    if (!org) {
      throw new PlatformOrgNoEncontradaError(orgId);
    }

    const memberships = await this.membershipsReader.findAllByTenant(orgId);
    return memberships.map((m) => PlatformOrgMemberResponseDto.fromMembership(m));
  }

  /**
   * Habilita un pack (eje 2) a una org (riel de packs §5.4). El super-admin es el
   * único que crea entitlement (`SuperAdminGuard`); la operación se audita vía
   * `PlatformAuditInterceptor`. La LÓGICA de dominio (validación de vertical §8,
   * escritura del entitlement con `activo=false`, invalidación de cache
   * `org-packs:<id>`) vive en `PackService`; este service solo valida que la org
   * exista (404 friendly) y delega — frontera de módulo vía `PackService`.
   *
   * @throws PlatformOrgNoEncontradaError si la org no existe.
   * @throws PackNoEncontradoError / PackVerticalNoAplicableError desde el dominio.
   */
  async habilitarPack(
    orgId: string,
    ref: { packId?: string; clave?: string },
    actorUserId: string,
  ): Promise<OrgPackEntitlementResponseDto> {
    await this.assertOrgExiste(orgId);
    const entitlement = await this.packs.habilitarParaOrg(orgId, ref, actorUserId);
    const conPack = await this.findEntitlementConPack(orgId, entitlement.packId);
    this.logger.log(`Org '${orgId}' pack ${entitlement.packId} habilitado por super-admin`);
    return toOrgPackEntitlementResponse(conPack);
  }

  /**
   * Revoca el entitlement de un pack de una org (borra la fila → cae la
   * activación). Idempotente: revocar un pack no habilitado no falla (el delete
   * no encuentra fila). Invalida el cache vía `PackService`.
   *
   * @throws PlatformOrgNoEncontradaError si la org no existe.
   */
  async revocarPack(orgId: string, packId: string): Promise<void> {
    await this.assertOrgExiste(orgId);
    await this.packs.revocar(orgId, packId);
    this.logger.log(`Org '${orgId}' pack ${packId} revocado por super-admin`);
  }

  /**
   * Lista los entitlements de packs de una org (catálogo habilitado + estado de
   * activación) para el panel super-admin.
   *
   * @throws PlatformOrgNoEncontradaError si la org no existe.
   */
  async listarPacks(orgId: string): Promise<OrgPackEntitlementResponseDto[]> {
    await this.assertOrgExiste(orgId);
    const entitlements = await this.packs.listarEntitlementsDeOrg(orgId);
    return entitlements.map(toOrgPackEntitlementResponse);
  }

  /**
   * Lista el catálogo global de packs vendibles para el panel super-admin.
   * Delega a PackService (frontera de módulo); mapea Pack (dominio) → DTO HTTP.
   * Org-less: el catálogo es global, no depende de ninguna org.
   */
  async listarCatalogoPacks(): Promise<PackResponseDto[]> {
    const packs = await this.packs.listarCatalogo();
    return packs.map(toPackResponse);
  }

  /**
   * KPIs del dashboard de plataforma (REQ-PCT-01, REQ-PCT-02).
   *
   * Ensambla estadísticas de orgs (vía PlatformStatsReaderPort) con el conteo
   * global de usuarios (vía prisma.user.count). ClockPort calcula la ventana
   * de 12 meses para cumplir Anti-20 (new Date() prohibido en servicios).
   */
  async getDashboard(): Promise<PlatformDashboardResponseDto> {
    const now = this.clock.now();
    // Ventana de 12 meses: inicio = primer día de hace 11 meses (para incluir el mes actual).
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

    const [dashboardData, totalUsuarios] = await Promise.all([
      this.statsReader.readDashboard(windowStart),
      this.prisma.user.count(),
    ]);

    return PlatformDashboardResponseDto.fromData(dashboardData, totalUsuarios);
  }

  /**
   * Timeline de actividad de plataforma paginado por cursor (REQ-PCT-03).
   *
   * Decodifica el cursor opaco (si existe) y delega al PlatformActivityReaderPort.
   * El cursor inválido propaga PlatformActivityCursorInvalidoError → HTTP 400.
   */
  async getActivity(
    query: Pick<PlatformActivityQueryDto, 'limit' | 'cursor' | 'orgId'>,
  ): Promise<PlatformActivityResponseDto> {
    const limit = query.limit ?? 20;

    const cursor = query.cursor !== undefined ? ActivityCursor.decode(query.cursor) : undefined;

    const page = await this.activityReader.findRecent({
      limit,
      ...(cursor !== undefined ? { cursor } : {}),
      ...(query.orgId !== undefined ? { orgId: query.orgId } : {}),
    });

    const dto = new PlatformActivityResponseDto();
    dto.items = page.items.map((item) => PlatformActivityItemDto.fromItem(item));
    dto.nextCursor = page.nextCursor;
    return dto;
  }

  /** Valida que la org exista; lanza 404 friendly antes de tocar el dominio de packs. */
  private async assertOrgExiste(orgId: string): Promise<void> {
    const org = await this.orgsReader.findById(orgId);
    if (!org) {
      throw new PlatformOrgNoEncontradaError(orgId);
    }
  }

  /** Recupera el entitlement recién creado enriquecido con el pack (para la respuesta). */
  private async findEntitlementConPack(
    orgId: string,
    packId: string,
  ): Promise<Parameters<typeof toOrgPackEntitlementResponse>[0]> {
    const entitlements = await this.packs.listarEntitlementsDeOrg(orgId);
    const conPack = entitlements.find((e) => e.packId === packId);
    if (!conPack) {
      // No debería ocurrir: lo acabamos de habilitar en la misma request.
      throw new PlatformOrgNoEncontradaError(orgId);
    }
    return conPack;
  }

  /**
   * Mapea el módulo elegido en el alta a los feature flags de la organización.
   * El `modulo` es un input transitorio — no se persiste como columna (Design D1).
   * Replica la lógica de TenantsService.flagsParaModulo para desacople de módulos.
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
}
