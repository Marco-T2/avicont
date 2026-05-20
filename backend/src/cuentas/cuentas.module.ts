import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { CUENTA_READER_PORT } from '../configuracion-contable/ports/cuenta-reader.port';
import { RbacModule } from '../rbac/rbac.module';

import { CuentaReaderAdapter } from './adapters/cuenta-reader.adapter';
import { PrismaCuentaRepository } from './adapters/prisma-cuenta.repository';
import { PrismaCuentasReaderAdapter } from './adapters/prisma-cuentas-reader.adapter';
import { PrismaPlanCuentasSeederAdapter } from './adapters/prisma-plan-cuentas-seeder.adapter';
import { StubMovimientosReader } from './adapters/stub-movimientos-reader';
import { CuentasController } from './cuentas.controller';
import { CuentasService } from './cuentas.service';
import { CUENTAS_READER_PORT } from './ports/cuentas-reader.port';
import { CUENTA_REPOSITORY_PORT } from './ports/cuenta.repository.port';
import {
  MOVIMIENTOS_READER_PORT,
  type MovimientosReaderPort,
} from './ports/movimientos-reader.port';
import { PLAN_CUENTAS_SEEDER_PORT } from './ports/plan-cuentas-seeder.port';

// Guard: durante Fase 1.0.x no existe PrismaMovimientosReader. Cuando se
// implemente en Fase 1.1, cambiar esta factory para elegir entre stub y
// adapter real según FASE_ASIENTOS_ACTIVO. Hoy, si alguien prende el flag
// antes de que exista el adapter real, el bootstrap falla loud.
function movimientosReaderFactory(): MovimientosReaderPort {
  if (process.env.FASE_ASIENTOS_ACTIVO === 'true') {
    throw new Error(
      'FASE_ASIENTOS_ACTIVO=true pero PrismaMovimientosReader aún no existe (llega en Fase 1.1).',
    );
  }
  return new StubMovimientosReader();
}

@Module({
  imports: [RbacModule],
  controllers: [CuentasController],
  providers: [
    CuentasService,
    PrismaService,
    TenantContextService,
    { provide: CUENTA_REPOSITORY_PORT, useClass: PrismaCuentaRepository },
    { provide: MOVIMIENTOS_READER_PORT, useFactory: movimientosReaderFactory },
    { provide: CUENTA_READER_PORT, useClass: CuentaReaderAdapter },
    // Port de lectura batch para el validador de comprobantes (Fase 1.3+).
    PrismaCuentasReaderAdapter,
    { provide: CUENTAS_READER_PORT, useExisting: PrismaCuentasReaderAdapter },
    // Port cross-module: consumido por `tenants` para sembrar el plan de cuentas
    // COMERCIAL al crear una organización (seeding-por-tipo §4.1).
    { provide: PLAN_CUENTAS_SEEDER_PORT, useClass: PrismaPlanCuentasSeederAdapter },
  ],
  exports: [CuentasService, CUENTA_READER_PORT, CUENTAS_READER_PORT, PLAN_CUENTAS_SEEDER_PORT],
})
export class CuentasModule {}
