import { Injectable } from '@nestjs/common';
import type { OrgConfiguracionContable } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import type {
  ActualizarConfiguracionData,
  ConfiguracionContableRepositoryPort,
} from '../ports/configuracion-contable.repository.port';

@Injectable()
export class PrismaConfiguracionContableRepository implements ConfiguracionContableRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  obtener(tenantId: string): Promise<OrgConfiguracionContable | null> {
    return this.prisma.orgConfiguracionContable.findUnique({
      where: { organizationId: tenantId },
    });
  }

  upsert(tenantId: string, data: ActualizarConfiguracionData): Promise<OrgConfiguracionContable> {
    // En create, los campos undefined se ignoran (Prisma) y los null quedan null
    // (default del modelo). En update, undefined no toca el campo, null lo limpia.
    // Ese es justamente el contrato documentado de ActualizarConfiguracionData.
    return this.prisma.orgConfiguracionContable.upsert({
      where: { organizationId: tenantId },
      create: { organizationId: tenantId, ...data },
      update: data,
    });
  }
}
