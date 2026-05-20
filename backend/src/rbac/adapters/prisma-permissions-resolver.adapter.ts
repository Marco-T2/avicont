import { Injectable } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { PermissionsResolverPort, ResolvedPermissions } from '../ports/permissions-resolver.port';

@Injectable()
export class PrismaPermissionsResolver implements PermissionsResolverPort {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, organizationId: string): Promise<ResolvedPermissions | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { customRole: { select: { permissions: true } } },
    });

    if (!membership || membership.deactivatedAt) return null;

    const esOwner = membership.systemRole === SystemRole.OWNER;
    const esAdmin = membership.systemRole === SystemRole.ADMIN;

    // OWNER y ADMIN tienen wildcard total. Restricciones operativas
    // (transferir ownership, eliminar org) viven en el dominio.
    if (esOwner || esAdmin) {
      return { esOwner, esAdmin, wildcards: ['*'] };
    }

    // Custom role: permisos crudos como están en BD.
    return {
      esOwner: false,
      esAdmin: false,
      wildcards: membership.customRole?.permissions ?? [],
    };
  }
}
