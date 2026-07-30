import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { VentaSnapshotsReaderPort } from '../ports/venta-snapshots-reader.port';

/**
 * Adapter de `VentaSnapshotsReaderPort`: proyección Prisma PROPIA de `ventas`
 * sobre las tablas de ítems y contactos — solo lectura, acotada al tenant
 * (§4.2). El patrón que este change sancionó en la Fase 3 (el repositorio de
 * `cuentas` lee `items` para `CUENTA_REFERENCIADA_POR_ITEMS`), porque
 * `ItemsReaderPort` tiene PROHIBIDO crecer (REQ-ITM-04) y `ContactosReaderPort`
 * no expone la razón social.
 */
@Injectable()
export class PrismaVentaSnapshotsReaderAdapter extends VentaSnapshotsReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerCuentasIngresoDeItems(
    tenantId: string,
    itemIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, string | null>> {
    if (itemIds.length === 0) return new Map();
    const client = tx ?? this.prisma;

    // organizationId SIEMPRE primer predicado (§4.2 Anti-31): un id de otro
    // tenant simplemente no aparece en el Map.
    const rows = await client.item.findMany({
      where: { organizationId: tenantId, id: { in: itemIds } },
      select: { id: true, cuentaIngresoId: true },
    });

    return new Map(rows.map((r) => [r.id, r.cuentaIngresoId]));
  }

  async obtenerRazonSocialContacto(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const client = tx ?? this.prisma;

    const contacto = await client.contacto.findFirst({
      where: { organizationId: tenantId, id: contactoId },
      select: { razonSocial: true },
    });

    return contacto?.razonSocial ?? null;
  }
}
