import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { type VentasConfig, VentasConfigReaderPort } from '../ports/ventas-config-reader.port';

/**
 * Adapter de `VentasConfigReaderPort`. Lee su PROPIA superficie Prisma sobre
 * `OrgConfiguracionContable` (molde: `PrismaCierreConfigReaderAdapter`, §3.7:
 * el módulo define su read-surface sin importar el repo de
 * `configuracion-contable`).
 */
@Injectable()
export class PrismaVentasConfigReaderAdapter extends VentasConfigReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerConfig(tenantId: string, tx?: Prisma.TransactionClient): Promise<VentasConfig> {
    const client = tx ?? this.prisma;

    // organizationId SIEMPRE primer predicado (§4.2 Anti-31).
    const config = await client.orgConfiguracionContable.findFirst({
      where: { organizationId: tenantId },
      select: { cuentasPorCobrarId: true, ventasId: true },
    });

    return {
      cuentasPorCobrarId: config?.cuentasPorCobrarId ?? null,
      ventasId: config?.ventasId ?? null,
    };
  }
}
