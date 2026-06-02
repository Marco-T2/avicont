import { Injectable } from '@nestjs/common';
import type { OrgPackEntitlement, Pack as PrismaPack } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import type { Pack } from '../domain/pack';
import { OrgPacksReaderPort } from '../ports/org-packs.reader.port';
import {
  OrgPackRepositoryPort,
  type OrgPackEntitlementConPack,
  type OrgPackEntitlementRow,
} from '../ports/org-pack.repository.port';

/**
 * Adapter Prisma del entitlement + activación de packs por org. Implementa
 * tanto el puerto de escritura interno (`OrgPackRepositoryPort`) como la
 * superficie pública cross-módulo (`OrgPacksReaderPort`).
 *
 * Multi-tenant estricto (§4.2 core): TODA query filtra por `organizationId`.
 */
@Injectable()
export class PrismaOrgPackRepository extends OrgPackRepositoryPort implements OrgPacksReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async habilitar(
    organizationId: string,
    packId: string,
    habilitadoPorUserId: string,
  ): Promise<OrgPackEntitlementRow> {
    const fila = await this.prisma.orgPackEntitlement.create({
      data: { organizationId, packId, habilitadoPorUserId },
    });
    return toRow(fila);
  }

  override async revocar(organizationId: string, packId: string): Promise<void> {
    await this.prisma.orgPackEntitlement.deleteMany({
      where: { organizationId, packId },
    });
  }

  override async setActivo(
    organizationId: string,
    packId: string,
    activo: boolean,
  ): Promise<OrgPackEntitlementRow> {
    const fila = await this.prisma.orgPackEntitlement.update({
      where: { organizationId_packId: { organizationId, packId } },
      data: { activo },
    });
    return toRow(fila);
  }

  override async findByOrgYPack(
    organizationId: string,
    packId: string,
  ): Promise<OrgPackEntitlementRow | null> {
    const fila = await this.prisma.orgPackEntitlement.findFirst({
      where: { organizationId, packId },
    });
    return fila === null ? null : toRow(fila);
  }

  override async findByOrg(organizationId: string): Promise<OrgPackEntitlementConPack[]> {
    const filas = await this.prisma.orgPackEntitlement.findMany({
      where: { organizationId },
      include: { pack: true },
      orderBy: { createdAt: 'asc' },
    });
    return filas.map((fila) => ({ ...toRow(fila), pack: toPack(fila.pack) }));
  }

  override async findClavesActivasByOrg(organizationId: string): Promise<string[]> {
    const filas = await this.prisma.orgPackEntitlement.findMany({
      where: { organizationId, activo: true },
      select: { pack: { select: { clave: true } } },
    });
    return filas.map((fila) => fila.pack.clave);
  }

  // ── OrgPacksReaderPort (superficie pública cross-módulo) ──

  async packsActivos(organizationId: string): Promise<string[]> {
    return this.findClavesActivasByOrg(organizationId);
  }

  async estaActivo(organizationId: string, clave: string): Promise<boolean> {
    const fila = await this.prisma.orgPackEntitlement.findFirst({
      where: { organizationId, activo: true, pack: { clave } },
      select: { id: true },
    });
    return fila !== null;
  }
}

function toRow(fila: OrgPackEntitlement): OrgPackEntitlementRow {
  return {
    id: fila.id,
    organizationId: fila.organizationId,
    packId: fila.packId,
    activo: fila.activo,
    habilitadoPorUserId: fila.habilitadoPorUserId,
  };
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
