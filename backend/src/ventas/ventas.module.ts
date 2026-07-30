import { Module } from '@nestjs/common';

import { AuditedTransactionRunner } from '@/common/audited-transaction.runner';
import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { ComprobantesModule } from '@/comprobantes/comprobantes.module';
import { ContactosModule } from '@/contactos/contactos.module';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { ItemsModule } from '@/items/items.module';
import { PeriodosReaderModule } from '@/periodos-fiscales/periodos-reader.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaVentaSnapshotsReaderAdapter } from './adapters/prisma-venta-snapshots-reader.adapter';
import { PrismaVentaRepository } from './adapters/prisma-venta.repository';
import { PrismaVentasConfigReaderAdapter } from './adapters/prisma-ventas-config-reader.adapter';
import { VENTA_SNAPSHOTS_READER_PORT } from './ports/venta-snapshots-reader.port';
import { VENTA_REPOSITORY_PORT } from './ports/venta.repository.port';
import { VENTAS_CONFIG_READER_PORT } from './ports/ventas-config-reader.port';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';

// Documento comercial de venta (change `ventas-piloto`, Fase 4). FREE sin
// pack (D-01); hexagonal §3.2.
//
// Todos los ports cross-módulo entran por el MÓDULO que los exporta (§3.3),
// nunca por el adapter concreto:
//   - `COMPROBANTE_SISTEMA_WRITER_PORT` ← ComprobantesModule (path-sistema que
//     RE-VALIDA; la venta ES su propio comprobante, REQ-VTA-01).
//   - `ITEMS_READER_PORT` ← ItemsModule (validar los itemId de las líneas).
//   - `CONTACTOS_READER_PORT` ← ContactosModule (cliente del tenant, activo).
//   - `CUENTAS_READER_PORT` y `CUENTAS_EFECTIVO_READER_PORT` ← CuentasModule
//     (snapshots vigentes + elegibilidad de la cuenta destino del CONTADO).
//   - `PERIODOS_READER_PORT` ← PeriodosReaderModule (módulo-puerto leaf, evita
//     el ciclo CJS con periodos-fiscales que crasheó el build de prod).
@Module({
  imports: [
    RbacModule,
    ComprobantesModule,
    ItemsModule,
    ContactosModule,
    CuentasModule,
    PeriodosReaderModule,
  ],
  controllers: [VentasController],
  providers: [
    PrismaService,
    TenantContextService,
    VentasService,

    // Wrapper transaccional de auditoría — se provee POR MÓDULO, no es global
    // (mismo trato que comprobantes.module): toda TX que emita
    // comprobantes_audit DEBE pasar por acá para inyectar app.audit_user_id.
    AuditedTransactionRunner,

    PrismaVentaRepository,
    { provide: VENTA_REPOSITORY_PORT, useExisting: PrismaVentaRepository },

    PrismaVentasConfigReaderAdapter,
    { provide: VENTAS_CONFIG_READER_PORT, useExisting: PrismaVentasConfigReaderAdapter },

    PrismaVentaSnapshotsReaderAdapter,
    { provide: VENTA_SNAPSHOTS_READER_PORT, useExisting: PrismaVentaSnapshotsReaderAdapter },
  ],
  exports: [VentasService],
})
export class VentasModule {}
