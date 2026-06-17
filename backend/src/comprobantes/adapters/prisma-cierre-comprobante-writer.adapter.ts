import { Injectable } from '@nestjs/common';
import { EstadoComprobante, Moneda, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  type CrearCierreData,
  CierreComprobanteWriterPort,
} from '../ports/cierre-comprobante-writer.port';

/**
 * Adapter del path-sistema de escritura de comprobantes de cierre (REQ-CMP-SYS-03).
 *
 * Escribe DIRECTAMENTE sobre la tabla `comprobantes` (no pasa por
 * `ComprobantesService` ni por `crearBorrador` del repo de usuario) porque los
 * comprobantes de cierre llevan campos de SISTEMA (`generadoPorSistema=true`,
 * `origenTipo`/`origenId` para la idempotencia REQ-CE-09) que el flujo de
 * usuario no expone. El borrado bypassa el bloqueo de `generadoPorSistema` que
 * el flujo de usuario sí aplica — es el canal interno autorizado de regeneración.
 *
 * Las líneas nacen en BOB con tipoCambio=1: los asientos de cierre operan sobre
 * `*Bob` (la moneda funcional, §4.2). El correlativo NO se asigna acá: se asigna
 * al CONTABILIZAR (§4.9), no al crear el borrador.
 */
@Injectable()
export class PrismaCierreComprobanteWriterAdapter extends CierreComprobanteWriterPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crearBorradorSistema(
    data: CrearCierreData,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const client = tx ?? this.prisma;
    const uno = new Prisma.Decimal(1);

    const comprobante = await client.comprobante.create({
      data: {
        organizationId: data.tenantId,
        tipo: data.tipo,
        estado: EstadoComprobante.BORRADOR,
        generadoPorSistema: true,
        fechaContable: data.fechaContable,
        periodoFiscalId: data.periodoFiscalId,
        glosa: data.glosa,
        monedaPrincipal: Moneda.BOB,
        origenTipo: data.origenTipo,
        origenId: data.origenId,
        // El path-sistema crea los asientos de cierre sin usuario humano. El
        // schema exige createdByUserId no-nulo: se usa el userId del actor que
        // dispara el cierre, propagado en data (el service lo pasa).
        createdByUserId: data.createdByUserId,
        lineas: {
          create: data.lineas.map((l, idx) => ({
            organizationId: data.tenantId,
            orden: idx + 1,
            cuentaId: l.cuentaId,
            contactoId: null,
            moneda: Moneda.BOB,
            debito: l.debito,
            credito: l.credito,
            tipoCambio: uno,
            debitoBob: l.debito,
            creditoBob: l.credito,
            glosaLinea: null,
          })),
        },
      },
      select: { id: true },
    });

    return { id: comprobante.id };
  }

  async eliminarBorradorSistema(
    comprobanteId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    // Path-sistema: borra el borrador de cierre sin el chequeo de
    // `generadoPorSistema` (REQ-CMP-SYS-03). Scoped al tenant (§4.2) y restringido
    // a BORRADOR (un cierre CONTABILIZADO no se borra: se anula). Las líneas caen
    // en cascada (onDelete: Cascade).
    await client.comprobante.deleteMany({
      where: {
        id: comprobanteId,
        organizationId: tenantId,
        estado: EstadoComprobante.BORRADOR,
        generadoPorSistema: true,
      },
    });
  }
}
