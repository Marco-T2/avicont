import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import { UsuarioReaderPort, UsuarioResumenRow } from '../ports/usuario-reader.port';

@Injectable()
export class PrismaUsuarioReaderAdapter extends UsuarioReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listarPorIds(tenantId: string, ids: readonly string[]): Promise<UsuarioResumenRow[]> {
    // Sin ids no hay consulta: `in: []` es un viaje a Postgres para nada.
    if (ids.length === 0) return [];

    return this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(ids)] },
        // El filtro de tenant vive en la membresía porque `User` es global
        // (§4.2: la excepción son los catálogos compartidos, y este no lo es).
        // Query builder y no raw: deja el predicado estáticamente visible.
        memberships: { some: { organizationId: tenantId } },
      },
      select: { id: true, displayName: true, email: true },
    });
  }
}
