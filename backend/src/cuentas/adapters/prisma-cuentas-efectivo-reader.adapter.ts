import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { esElegibleComoDestinoDeEfectivo } from '../domain/elegibilidad-efectivo';
import type { CuentasEfectivoReaderPort } from '../ports/cuentas-efectivo-reader.port';
import { toDominioActividadFlujo } from './enum-mappers';

/**
 * Adapter de `CuentasEfectivoReaderPort`. Lee los 4 campos que el criterio
 * necesita y delega la decisión al dominio puro — acá no vive ninguna regla.
 */
@Injectable()
export class PrismaCuentasEfectivoReaderAdapter implements CuentasEfectivoReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async esElegibleComoDestino(
    tenantId: string,
    cuentaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;

    // §4.2 defense in depth: el filtro por `organizationId` va acá también, no
    // sólo en el guard y el servicio del consumidor.
    const cuenta = await client.cuenta.findFirst({
      where: { id: cuentaId, organizationId: tenantId },
      select: { codigoInterno: true, esDetalle: true, activa: true, actividadFlujo: true },
    });

    // Inexistente y ajena colapsan al mismo `false`: para quien pregunta son el
    // mismo hecho, y separarlos revelaría recursos de otro tenant.
    if (cuenta === null) return false;

    return esElegibleComoDestinoDeEfectivo({
      codigoInterno: cuenta.codigoInterno,
      esDetalle: cuenta.esDetalle,
      activa: cuenta.activa,
      actividadFlujo:
        cuenta.actividadFlujo === null ? null : toDominioActividadFlujo(cuenta.actividadFlujo),
    });
  }
}
