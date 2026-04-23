import { Injectable, BadRequestException, Inject, Logger, NotFoundException } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { ConflictError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../cache/redis.service';
import {
  GESTIONES_READER_PORT,
  GestionesReaderPort,
} from '../periodos-fiscales/ports/gestiones-reader.port';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(GESTIONES_READER_PORT)
    private readonly gestionesReader: GestionesReaderPort,
  ) {}

  async create(dto: CreateTenantDto, ownerId: string) {
    const slug = this.generateSlug(dto.name);
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException('Tenant slug already exists');
    }

    return this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        memberships: {
          create: { userId: ownerId, systemRole: SystemRole.OWNER },
        },
      },
      include: { memberships: true },
    });
  }

  async findById(id: string) {
    const tenant = await this.prisma.organization.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.organization.findUnique({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    if (dto.tipoEmpresaPrincipal !== undefined) {
      const tieneGestion = await this.gestionesReader.existeAlgunaGestion(id);
      if (tieneGestion) {
        // Ver docs/disenos/gestiones-periodos-fiscales-v3.md §2.1
        throw new ConflictError(
          'TENANT_EMPRESA_INMUTABLE',
          'El tipo de empresa no se puede cambiar porque ya existe una gestión fiscal. Elimine o cierre las gestiones primero.',
          { tenantId: id },
        );
      }
    }
    return this.prisma.organization.update({
      where: { id },
      data: dto,
    });
  }

  async getMembers(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId: tenantId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
        customRole: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  // ------ Feature flags por organización (módulos) ------

  async getFeatures(tenantId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: tenantId },
      select: { contabilidadEnabled: true, granjaEnabled: true },
    });
    if (!org) throw new NotFoundException('Tenant not found');
    return org;
  }

  async updateFeatures(tenantId: string, dto: UpdateFeaturesDto) {
    const updated = await this.prisma.organization.update({
      where: { id: tenantId },
      data: {
        ...(dto.contabilidadEnabled !== undefined
          ? { contabilidadEnabled: dto.contabilidadEnabled }
          : {}),
        ...(dto.granjaEnabled !== undefined ? { granjaEnabled: dto.granjaEnabled } : {}),
      },
      select: { contabilidadEnabled: true, granjaEnabled: true },
    });

    // Invalidar el cache que usa ModuleEnabledGuard.
    try {
      await this.redis.del(`org-features:${tenantId}`);
    } catch (e) {
      this.logger.warn(`Failed to invalidate features cache: ${(e as Error).message}`);
    }

    return updated;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
