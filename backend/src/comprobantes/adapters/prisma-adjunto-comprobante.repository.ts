import { Injectable } from '@nestjs/common';
import type { AdjuntoComprobante, PrismaClient } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { AdjuntoNoEncontradoError } from '../domain/adjunto-errors';
import type {
  AdjuntoComprobanteRepositoryPort,
  ActualizarAdjuntoData,
  CrearAdjuntoData,
} from '../ports/adjunto-comprobante.repository.port';

/**
 * Adapter Prisma de AdjuntoComprobanteRepositoryPort.
 *
 * TODAS las queries filtran por `organizationId` para cumplir Anti-31
 * (aislamiento multi-tenant estricto, CLAUDE.md §4.2 core).
 * Cross-tenant → null (404 semántico, no revela existencia).
 *
 * Acepta `PrismaService` vía inyección NestJS en producción (DI), o un
 * `PrismaClient` raw pasado directamente en tests de integración.
 * El constructor tipado como `PrismaService` para compatibilidad con NestJS DI;
 * internamente se acepta también `PrismaClient` (para tests) vía `as unknown`.
 */
@Injectable()
export class PrismaAdjuntoComprobanteRepository implements AdjuntoComprobanteRepositoryPort {
  private readonly prisma: PrismaService | PrismaClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService;
  }

  async crear(data: CrearAdjuntoData): Promise<AdjuntoComprobante> {
    return this.prisma.adjuntoComprobante.create({
      data: {
        organizationId: data.organizationId,
        comprobanteId: data.comprobanteId,
        storageKey: data.storageKey,
        nombreOriginal: data.nombreOriginal,
        mimeType: data.mimeType,
        tamanoBytes: data.tamanoBytes,
        ...(data.sha256 !== undefined ? { sha256: data.sha256 } : {}),
        subidoPorUserId: data.subidoPorUserId,
      },
    });
  }

  async listar(organizationId: string, comprobanteId: string): Promise<AdjuntoComprobante[]> {
    // Anti-31: doble filtro organizationId + comprobanteId.
    return this.prisma.adjuntoComprobante.findMany({
      where: { organizationId, comprobanteId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async obtenerPorId(
    organizationId: string,
    adjuntoId: string,
  ): Promise<AdjuntoComprobante | null> {
    // Anti-31: el filtro de organizationId garantiza que un adjunto de otro
    // tenant devuelve null (404 semántico — no revela que el id existe).
    return this.prisma.adjuntoComprobante.findFirst({
      where: { id: adjuntoId, organizationId },
    });
  }

  async actualizar(
    organizationId: string,
    adjuntoId: string,
    data: ActualizarAdjuntoData,
  ): Promise<AdjuntoComprobante> {
    // Anti-31 (CLAUDE.md §4.2): updateMany con organizationId garantiza que un
    // adjunto de otro tenant no se modifica. count === 0 → el adjunto no existe
    // en este tenant; lanzamos AdjuntoNoEncontradoError (404 semántico).
    const result = await this.prisma.adjuntoComprobante.updateMany({
      where: { id: adjuntoId, organizationId },
      data: {
        storageKey: data.storageKey,
        nombreOriginal: data.nombreOriginal,
        mimeType: data.mimeType,
        tamanoBytes: data.tamanoBytes,
        ...(data.sha256 !== undefined ? { sha256: data.sha256 } : {}),
      },
    });

    if (result.count === 0) {
      throw new AdjuntoNoEncontradoError(adjuntoId);
    }

    // updateMany no devuelve el registro: lo recuperamos con findFirst que ya
    // incluye el filtro organizationId (Anti-31 doble — no es redundante).
    const actualizado = await this.prisma.adjuntoComprobante.findFirst({
      where: { id: adjuntoId, organizationId },
    });

    // Invariante: si updateMany count === 1, el findFirst DEBE devolver el registro.
    // Si llega null aquí es por una condición de carrera extrema — protegemos el tipo.
    if (!actualizado) {
      throw new AdjuntoNoEncontradoError(adjuntoId);
    }

    return actualizado;
  }

  async eliminar(organizationId: string, adjuntoId: string): Promise<boolean> {
    // Anti-31: el filtro de organizationId garantiza que no se borra de otro tenant.
    const result = await this.prisma.adjuntoComprobante.deleteMany({
      where: { id: adjuntoId, organizationId },
    });
    return result.count > 0;
  }

  async contarPorComprobante(organizationId: string, comprobanteId: string): Promise<number> {
    // Anti-31: filtra por organizationId + comprobanteId.
    return this.prisma.adjuntoComprobante.count({
      where: { organizationId, comprobanteId },
    });
  }
}
