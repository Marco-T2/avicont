import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaContactosRepository } from './adapters/prisma-contactos.repository';
import { ContactosController } from './contactos.controller';
import { ContactosService } from './contactos.service';
import { CONTACTOS_REPOSITORY_PORT } from './ports/contactos.repository.port';

// Fase 1.4 slice 1 — módulo CRUD de contactos (clientes y/o proveedores).
// El ContactosReaderPort que consume ComprobantesModule se agrega en el
// commit 6 (integración con comprobantes).
@Module({
  imports: [RbacModule],
  controllers: [ContactosController],
  providers: [
    PrismaService,
    TenantContextService,
    ContactosService,

    PrismaContactosRepository,
    { provide: CONTACTOS_REPOSITORY_PORT, useExisting: PrismaContactosRepository },
  ],
  exports: [ContactosService],
})
export class ContactosModule {}
