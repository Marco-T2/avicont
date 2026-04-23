import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import type {
  CuentaParaValidacion,
  CuentaReaderPort,
} from '../../configuracion-contable/ports/cuenta-reader.port';

// Adapter del port que configuracion-contable define (ver CLAUDE.md §3.7).
// Vive en src/cuentas/adapters/ porque cuentas es el "dueño" del dato Cuenta.
// CuentasModule registra el binding y lo EXPORTA para que ConfiguracionContableModule
// lo pueda inyectar.
//
// Expone solo los campos mínimos que el consumidor necesita, no toda la fila.
@Injectable()
export class CuentaReaderAdapter implements CuentaReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async findForConfigValidation(
    cuentaId: string,
    tenantId: string,
  ): Promise<CuentaParaValidacion | null> {
    const row = await this.prisma.cuenta.findFirst({
      where: { id: cuentaId, organizationId: tenantId },
      select: {
        id: true,
        organizationId: true,
        claseCuenta: true,
        activa: true,
        esDetalle: true,
        codigoInterno: true,
        nombre: true,
      },
    });
    return row ?? null;
  }
}
