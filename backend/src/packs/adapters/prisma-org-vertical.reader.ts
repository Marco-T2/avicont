import { Injectable } from '@nestjs/common';
import type { VerticalPack } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { OrgVerticalReaderPort } from '../ports/org-vertical.reader.port';

/**
 * Adapter Prisma que deriva el vertical de una org a partir de sus flags de
 * módulo. El invariante `organizations_vertical_exclusivo_check` garantiza que
 * `contabilidadEnabled` y `granjaEnabled` nunca son true a la vez (§10.4 core).
 */
@Injectable()
export class PrismaOrgVerticalReader extends OrgVerticalReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async verticalDe(organizationId: string): Promise<VerticalPack | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { contabilidadEnabled: true, granjaEnabled: true },
    });
    if (org === null) return null;
    if (org.contabilidadEnabled) return 'CONTABILIDAD';
    if (org.granjaEnabled) return 'GRANJA';
    return null;
  }
}
