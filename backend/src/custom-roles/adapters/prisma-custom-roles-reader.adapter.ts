import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import { CustomRolesReaderPort } from '../ports/custom-roles-reader.port';

@Injectable()
export class PrismaCustomRolesReaderAdapter extends CustomRolesReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async belongsToTenant(
    customRoleId: string,
    tenantId: string,
  ): Promise<boolean> {
    const row = await this.prisma.customRole.findFirst({
      where: { id: customRoleId, organizationId: tenantId },
      select: { id: true },
    });
    return row !== null;
  }
}
