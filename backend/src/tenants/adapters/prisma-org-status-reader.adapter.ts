import { Injectable } from '@nestjs/common';
import type { OrganizationStatus } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { OrgStatusReaderPort } from '@/common/ports/org-status-reader.port';

@Injectable()
export class PrismaOrgStatusReaderAdapter extends OrgStatusReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async getStatus(id: string): Promise<OrganizationStatus | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { status: true },
    });
    return org?.status ?? null;
  }
}
