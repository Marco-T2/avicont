import { Injectable } from '@nestjs/common';
import type { Pack as PrismaPack } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import type { Pack } from '../domain/pack';
import { PackCatalogReaderPort } from '../ports/pack-catalog.reader.port';

/**
 * Adapter Prisma de solo-lectura del catálogo global de packs. `Pack` no tiene
 * `organizationId` (catálogo compartido, excepción §4.2 core): no se filtra por
 * tenant.
 */
@Injectable()
export class PrismaPackCatalogReader extends PackCatalogReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async listar(opciones?: { incluirInactivos?: boolean }): Promise<Pack[]> {
    const packs = await this.prisma.pack.findMany({
      where: opciones?.incluirInactivos === true ? {} : { activo: true },
      orderBy: { clave: 'asc' },
    });
    return packs.map(toPack);
  }

  override async findByClave(clave: string): Promise<Pack | null> {
    const pack = await this.prisma.pack.findUnique({ where: { clave } });
    return pack === null ? null : toPack(pack);
  }

  override async findById(id: string): Promise<Pack | null> {
    const pack = await this.prisma.pack.findUnique({ where: { id } });
    return pack === null ? null : toPack(pack);
  }
}

function toPack(pack: PrismaPack): Pack {
  return {
    id: pack.id,
    clave: pack.clave,
    nombre: pack.nombre,
    descripcion: pack.descripcion,
    verticalAplicable: pack.verticalAplicable,
    tipo: pack.tipo,
    activo: pack.activo,
  };
}
