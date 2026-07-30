import { Module } from '@nestjs/common';

import { AuditedTransactionRunner } from '@/common/audited-transaction.runner';
import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { ComprobantesModule } from '@/comprobantes/comprobantes.module';
import { ContactosModule } from '@/contactos/contactos.module';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PeriodosReaderModule } from '@/periodos-fiscales/periodos-reader.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaCarteraReaderAdapter } from './adapters/prisma-cartera-reader.adapter';
import { PrismaCobroRepository } from './adapters/prisma-cobro.repository';
import { PrismaCobrosConfigReaderAdapter } from './adapters/prisma-cobros-config-reader.adapter';
import { CobrosController } from './cobros.controller';
import { CobrosService } from './cobros.service';
import { EstadoCuentaController } from './estado-cuenta.controller';
import { EstadoCuentaService } from './estado-cuenta.service';
import { CARTERA_READER_PORT } from './ports/cartera-reader.port';
import { COBRO_REPOSITORY_PORT } from './ports/cobro.repository.port';
import { COBROS_CONFIG_READER_PORT } from './ports/cobros-config-reader.port';

// Cuentas por Cobrar (change `ventas-piloto`, Fase 5). FREE sin pack (D-01);
// hexagonal §3.2. El cobro es un hecho contable independiente (REQ-CXC-02) y
// las aplicaciones son vínculos editables que no generan asiento (REQ-CXC-03).
//
// Todos los ports cross-módulo entran por el MÓDULO que los exporta (§3.3),
// nunca por el adapter concreto:
//   - `COMPROBANTE_SISTEMA_WRITER_PORT` ← ComprobantesModule (path-sistema que
//     RE-VALIDA; el cobro ES su propio comprobante INGRESO, D-11).
//   - `CONTACTOS_READER_PORT` ← ContactosModule (cliente del tenant, activo).
//   - `CUENTAS_EFECTIVO_READER_PORT` ← CuentasModule (elegibilidad de la
//     cuenta destino, criterio único de REQ-CXC-02).
//   - `PERIODOS_READER_PORT` ← PeriodosReaderModule (módulo-puerto leaf, evita
//     el ciclo CJS con periodos-fiscales que crasheó el build de prod).
//   - `CLOCK_PORT` llega del `ClockModule` global (el "hoy" del estado de
//     cuenta, §4.6 — jamás `new Date()`).
@Module({
  imports: [RbacModule, ComprobantesModule, ContactosModule, CuentasModule, PeriodosReaderModule],
  controllers: [CobrosController, EstadoCuentaController],
  providers: [
    PrismaService,
    TenantContextService,
    CobrosService,
    EstadoCuentaService,

    // Wrapper transaccional de auditoría — se provee POR MÓDULO, no es global
    // (mismo trato que comprobantes.module y ventas.module): toda TX que emita
    // comprobantes_audit DEBE pasar por acá para inyectar app.audit_user_id.
    AuditedTransactionRunner,

    PrismaCobroRepository,
    { provide: COBRO_REPOSITORY_PORT, useExisting: PrismaCobroRepository },

    PrismaCobrosConfigReaderAdapter,
    { provide: COBROS_CONFIG_READER_PORT, useExisting: PrismaCobrosConfigReaderAdapter },

    PrismaCarteraReaderAdapter,
    { provide: CARTERA_READER_PORT, useExisting: PrismaCarteraReaderAdapter },
  ],
  exports: [CobrosService],
})
export class CuentasPorCobrarModule {}
