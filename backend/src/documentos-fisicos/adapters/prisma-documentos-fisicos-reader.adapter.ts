import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import type { DocumentoFisicoConRelaciones } from '../ports/documento-fisico.repository.port';
import {
  DocumentoFisicoParaAsociar,
  DocumentosFisicosReaderPort,
} from '../ports/documentos-fisicos-reader.port';

@Injectable()
export class PrismaDocumentosFisicosReaderAdapter extends DocumentosFisicosReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerBatchParaAsociar(
    tenantId: string,
    documentoFisicoIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, DocumentoFisicoParaAsociar>> {
    // Early-return: no hay ids que buscar.
    if (documentoFisicoIds.length === 0) return new Map();

    // Deduplicar para evitar duplicados en la cláusula IN y resultados repetidos.
    const ids = [...new Set(documentoFisicoIds)];

    const client = tx ?? this.prisma;

    // organizationId en where: defense in depth (CLAUDE.md §4.2, Anti-31).
    // Include mínimo al tipo para traer esTributario + tiposComprobanteAplicables
    // en un solo query (Decisión 11 del change).
    const rows = await client.documentoFisico.findMany({
      where: { id: { in: ids }, organizationId: tenantId },
      include: {
        tipoDocumento: {
          select: { nombre: true, esTributario: true, tiposComprobanteAplicables: true },
        },
      },
    });

    const resultado = new Map<string, DocumentoFisicoParaAsociar>();
    for (const row of rows) {
      resultado.set(row.id, {
        id: row.id,
        numero: row.numero,
        tipoDocumentoFisicoId: row.tipoDocumentoFisicoId,
        tipoDocumentoNombre: row.tipoDocumento.nombre,
        esTributario: row.tipoDocumento.esTributario,
        fechaEmision: row.fechaEmision,
        monto: row.monto,
        moneda: row.moneda,
        contactoId: row.contactoId,
        tiposComprobanteAplicables: row.tipoDocumento.tiposComprobanteAplicables,
      });
    }

    return resultado;
  }

  async idsYaAsociadosAContabilizado(
    tenantId: string,
    documentoFisicoIds: string[],
    excluyendoComprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    // Early-return: no hay ids que validar.
    if (documentoFisicoIds.length === 0) return [];

    const ids = [...new Set(documentoFisicoIds)];

    const client = tx ?? this.prisma;

    // organizationId en where: defense in depth (CLAUDE.md §4.2, Anti-31).
    // NOT excluye el propio comprobante para permitir re-contabilizar
    // (p.ej. al pasar de BORRADOR a CONTABILIZADO el mismo comprobante).
    const asociaciones = await client.comprobanteDocumentoFisico.findMany({
      where: {
        documentoFisicoId: { in: ids },
        comprobanteEstado: 'CONTABILIZADO',
        NOT: { comprobanteId: excluyendoComprobanteId },
        organizationId: tenantId,
      },
      select: { documentoFisicoId: true },
    });

    return asociaciones.map((a) => a.documentoFisicoId);
  }

  async listarAsociadosDeComprobante(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisicoConRelaciones[]> {
    const client = tx ?? this.prisma;

    // JOIN comprobante_documento_fisico → documentoFisico → tipoDocumento.
    // organizationId en where: defense in depth (CLAUDE.md §4.2, Anti-31).
    // El include trae tipo + contacto embebidos para que el mapper
    // `toDocumentoFisicoAsociadoDto` arme el read-model sin segundo query.
    const asociaciones = await client.comprobanteDocumentoFisico.findMany({
      where: { organizationId: tenantId, comprobanteId },
      include: {
        documentoFisico: {
          include: {
            tipoDocumento: {
              select: {
                id: true,
                nombre: true,
                codigo: true,
                esTributario: true,
                numeracionAutomatica: true,
              },
            },
            contacto: { select: { id: true, razonSocial: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return asociaciones.map((a) => a.documentoFisico);
  }
}
