import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaContactosReaderAdapter } from './adapters/prisma-contactos-reader.adapter';
import { PrismaContactosRepository } from './adapters/prisma-contactos.repository';
import { ContactosController } from './contactos.controller';
import { ContactosService } from './contactos.service';
import { CONTACTOS_READER_PORT } from './ports/contactos-reader.port';
import { CONTACTOS_REPOSITORY_PORT } from './ports/contactos.repository.port';

// Fase 1.4 slice 1 — módulo CRUD de contactos (clientes y/o proveedores).
// El CONTACTOS_READER_PORT se expone para que ComprobantesModule valide
// los contactoId de las líneas (existe + activo) sin acoplarse al repo
// completo.
@Module({
  imports: [RbacModule],
  controllers: [ContactosController],
  providers: [
    PrismaService,
    TenantContextService,
    ContactosService,

    PrismaContactosRepository,
    { provide: CONTACTOS_REPOSITORY_PORT, useExisting: PrismaContactosRepository },

    PrismaContactosReaderAdapter,
    { provide: CONTACTOS_READER_PORT, useExisting: PrismaContactosReaderAdapter },
  ],
  exports: [ContactosService, CONTACTOS_READER_PORT],
})
export class ContactosModule {}
