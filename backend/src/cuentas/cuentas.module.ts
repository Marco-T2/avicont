import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { CUENTA_READER_PORT } from '../configuracion-contable/ports/cuenta-reader.port';
import { RbacModule } from '../rbac/rbac.module';

import { CuentaReaderAdapter } from './adapters/cuenta-reader.adapter';
import { PrismaCatalogoPuctReader } from './adapters/prisma-catalogo-puct-reader';
import { PrismaCuentaRepository } from './adapters/prisma-cuenta.repository';
import { StubMovimientosReader } from './adapters/stub-movimientos-reader';
import { CuentasController } from './cuentas.controller';
import { CuentasService } from './cuentas.service';
import { CATALOGO_PUCT_READER_PORT } from './ports/catalogo-puct-reader.port';
import { CUENTA_REPOSITORY_PORT } from './ports/cuenta.repository.port';
import {
  MOVIMIENTOS_READER_PORT,
  type MovimientosReaderPort,
} from './ports/movimientos-reader.port';

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
    { provide: CATALOGO_PUCT_READER_PORT, useClass: PrismaCatalogoPuctReader },
    { provide: MOVIMIENTOS_READER_PORT, useFactory: movimientosReaderFactory },
    { provide: CUENTA_READER_PORT, useClass: CuentaReaderAdapter },
  ],
  exports: [CuentasService, CUENTA_READER_PORT],
})
export class CuentasModule {}
