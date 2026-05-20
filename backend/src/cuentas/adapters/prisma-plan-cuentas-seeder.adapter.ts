import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  poblarConfiguracionContableRequerida,
  sembrarPlanCuentasComercial,
} from '../../../prisma/seeds/prod/planes-cuentas/comercial';

import { PlanCuentasSeederPort } from '../ports/plan-cuentas-seeder.port';

@Injectable()
export class PrismaPlanCuentasSeederAdapter extends PlanCuentasSeederPort {
  override async seedDefaultsForTenant(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { porCodigoInterno } = await sembrarPlanCuentasComercial(tx, tenantId);
    await poblarConfiguracionContableRequerida(tx, tenantId, porCodigoInterno);
  }
}
