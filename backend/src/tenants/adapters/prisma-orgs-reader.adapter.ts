import { Injectable } from '@nestjs/common';
import type { Organization } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { OrgsReaderPort } from '@/platform/ports/orgs-reader.port';

/**
 * Adapter que implementa OrgsReaderPort para el módulo platform.
 * El módulo `tenants` es el dueño del dominio Organization; expone esta
 * superficie de lectura cross-tenant a través del token ORGS_READER_PORT
 * (CLAUDE.md §3.3 y §3.7).
 */
@Injectable()
export class PrismaOrgsReaderAdapter extends OrgsReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override listAll(): Promise<Organization[]> {
    // Listado cross-tenant legítimo para el super-admin (REQ-SA-12).
    // El acceso está gateado por SuperAdminGuard — no se filtra por tenantId.
    return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
  }

  override findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }
}

