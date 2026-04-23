import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import type { CatalogoPuctReaderPort, PuctEntry } from '../ports/catalogo-puct-reader.port';

@Injectable()
export class PrismaCatalogoPuctReader implements CatalogoPuctReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByCodigo(codigo: string): Promise<PuctEntry | null> {
    const row = await this.prisma.catalogoPuct.findUnique({
      where: { codigo },
      select: { codigo: true, nivel: true, nombre: true, versionPuct: true },
    });
    return row ?? null;
  }
}
