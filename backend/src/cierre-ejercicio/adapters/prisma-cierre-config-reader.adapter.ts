import { Injectable } from '@nestjs/common';

import type { TipoEmpresa } from '@/common/domain/enums';
import { PrismaService } from '@/common/prisma.service';

import { CierreConfigCuentaFaltanteError } from '../domain/cierre-errors';
import { type CierreConfig, CierreConfigReaderPort } from '../ports/cierre-config-reader.port';

/**
 * Adapter de `CierreConfigReaderPort`. Lee su PROPIA superficie Prisma
 * (`OrgConfiguracionContable` + `Organization.tipoEmpresaPrincipal`), mismo
 * patrón que los adapters de `reportes` (§3.7): el módulo de cierre define su
 * read-surface sin importar el repo de configuracion-contable ni de tenants.
 *
 * Lanza `CierreConfigCuentaFaltanteError` (422) si alguna cuenta destino del
 * cierre no está configurada (REQ-CE-04).
 */
@Injectable()
export class PrismaCierreConfigReaderAdapter extends CierreConfigReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerConfig(tenantId: string): Promise<CierreConfig> {
    // organizationId SIEMPRE primer predicado (§4.2 Anti-31).
    const [config, org] = await Promise.all([
      this.prisma.orgConfiguracionContable.findFirst({
        where: { organizationId: tenantId },
        select: { resultadoEjercicioId: true, resultadosAcumuladosId: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: tenantId },
        select: { tipoEmpresaPrincipal: true },
      }),
    ]);

    const resultadoEjercicioId = config?.resultadoEjercicioId ?? null;
    const resultadosAcumuladosId = config?.resultadosAcumuladosId ?? null;

    if (resultadoEjercicioId === null) {
      throw new CierreConfigCuentaFaltanteError('resultadoEjercicioId');
    }
    if (resultadosAcumuladosId === null) {
      throw new CierreConfigCuentaFaltanteError('resultadosAcumuladosId');
    }
    if (org === null) {
      // No debería ocurrir: si la gestión existe, la org existe. Defensivo.
      throw new CierreConfigCuentaFaltanteError('tipoEmpresaPrincipal');
    }

    return {
      resultadoEjercicioId,
      resultadosAcumuladosId,
      tipoEmpresaPrincipal: org.tipoEmpresaPrincipal as TipoEmpresa,
    };
  }
}
