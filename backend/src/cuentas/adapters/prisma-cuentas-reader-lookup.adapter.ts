import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import type { CuentaLookupResult } from '../ports/cuentas-reader-lookup.port';
import { CuentasReaderLookupPort } from '../ports/cuentas-reader-lookup.port';

@Injectable()
export class PrismaCuentasReaderLookupAdapter extends CuentasReaderLookupPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async obtenerCuentaDetalle(
    tenantId: string,
    cuentaId: string,
  ): Promise<CuentaLookupResult | null> {
    // Defense in depth (§4.2): organizationId en el where. Otro tenant → null.
    return this.prisma.cuenta.findFirst({
      where: { id: cuentaId, organizationId: tenantId },
      select: { id: true, esDetalle: true },
    });
  }
}
