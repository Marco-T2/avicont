import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { type CobrosConfig, CobrosConfigReaderPort } from '../ports/cobros-config-reader.port';

/**
 * Adapter de `CobrosConfigReaderPort`. Lee su PROPIA superficie Prisma sobre
 * `OrgConfiguracionContable` (molde: `PrismaVentasConfigReaderAdapter`, §3.7:
 * el módulo define su read-surface sin importar el repo de
 * `configuracion-contable` ni el port de `ventas`).
 */
@Injectable()
export class PrismaCobrosConfigReaderAdapter extends CobrosConfigReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerConfig(tenantId: string, tx?: Prisma.TransactionClient): Promise<CobrosConfig> {
    const client = tx ?? this.prisma;

    // organizationId SIEMPRE primer predicado (§4.2 Anti-31).
    const config = await client.orgConfiguracionContable.findFirst({
      where: { organizationId: tenantId },
      select: { cuentasPorCobrarId: true },
    });

    return { cuentasPorCobrarId: config?.cuentasPorCobrarId ?? null };
  }
}
